# Reorganización de Pagos Personales y Servicio Básico — Design Spec

**Goal:** Reorganizar cómo se clasifican y muestran los pagos personales en el Talonario, igual a como la contadora separa sus propias cuentas, y agregar un mecanismo dedicado para servicios básicos (luz, agua) con forma de pago y alerta anti-duplicado.

**Architecture:** Cambios de ruteo de datos entre categorías existentes (sin tocar la mecánica de fondo de `talonario_pagos_personales`), una tabla nueva y simple para el registro de "Facturas Personales" repropuesto, un flag nuevo + forma de pago en el catálogo de Pagos Fijos Personales que reutiliza el mismo patrón ya construido para Adelantos de Nómina (vincular con Caja Chica o Banco), y una alerta de texto en Caja Chica.

**Tech Stack:** React, Supabase/PostgREST.

**Fuera de alcance (explícitamente acordado):**
- Subir el archivo de factura/XML — descartado por David, solo se guarda el número de factura como texto.
- Migrar retroactivamente diciembre 2025 (ya importado) a la tabla nueva de Facturas Personales — se queda como está, el cambio aplica solo para adelante.
- Separar "Gastos Personales" de "Otros" en 2 líneas del Resumen — sigue mezclado en una sola línea, sin cambios ahí.
- IESS patronal en CONSOLIDADO y el tema de inventario/ventas — de sesiones anteriores, no aplica aquí.

---

## 1. Pagos Gastos Personales (sección dentro de Pagos Personales)

**Pagos Fijos Personales deja de excluirse de la lista editable.** Hoy, `PagosPersonales.js` filtra `filas.filter(f => sec.cats.includes(f.categoria) && !f.pago_fijo_personal_id)` — esto oculta de las 3 secciones cualquier fila que venga de un pago fijo registrado, mostrándola solo en la tabla flotante "📌 Pagos Fijos Personales del Mes". Se quita la condición `!f.pago_fijo_personal_id`: una vez registrado el pago fijo del mes, la fila aparece directamente dentro de "Pagos Gastos Personales", editable/borrable igual que cualquier fila manual. La tabla de catálogo arriba (con el botón "▶ Registrar") no cambia — sigue siendo el mecanismo para registrar el pago de ese mes.

**Compras marcadas "Personal" desde el módulo Compras se muestran/cuentan aquí.** Hoy `compras.es_personal=true` (marcado a mano en el módulo Compras, NO vía Excel) se muestra de solo lectura en la pantalla "Facturas Personales". Se mueve esa misma vista de solo lectura a vivir dentro de la sección "Pagos Gastos Personales" de `PagosPersonales.js`.

**El Excel ya funciona correctamente aquí, sin cambios.** La hoja "OTROS PAGOS PERSONALES", columna izquierda, sub-tabla "PAGOS GASTOS PERSONALES" (después de ese encabezado), ya se importa con `categoria: 'gastos_personal'` sin `pago_fijo_personal_id` (`importExcelHistorial.js` línea 482) — ya aparece tal cual en esta sección hoy. No requiere cambios.

---

## 2. Otros Pagos Personales

**Caja Chica marcado "Personal" cambia de categoría.** Hoy, en `PagosPersonales.js` (línea ~135), cualquier `caja_gastos` con `es_personal=true` se inyecta siempre con `categoria: 'gastos_personal'`. Cambia a `categoria: 'otros'`. El resto del mecanismo (de solo lectura, marcado `_readOnly: true`) no cambia.

El resto de "Otros" (manual y Excel columna derecha) no cambia.

---

## 3. Facturas Personales (repropuesta)

**Nueva tabla:** `talonario_registro_facturas_dueno`
- `id` (uuid, PK)
- `mes`, `año` (integer)
- `fecha` (date)
- `ruc` (text)
- `proveedor` (text)
- `numero_factura` (text)
- `valor` (numeric)
- `detalle` (text) — texto libre, puede tener varios ítems separados por "|", igual que la hoja real de la contadora
- `created_at` (timestamptz)

**Sin forma de pago** — es un registro puro, no representa salida de dinero de la empresa (son facturas a nombre del dueño hechas por otras personas de la familia, sin relación con el flujo de caja del negocio).

**UI:** la pantalla "Facturas Personales" (`FacturasPersonales.js`) deja de mostrar `talonario_facturas_personales` (formulario viejo con ítems+IVA) y `compras.es_personal=true` (se movió a la sección 1) — pasa a mostrar/editar exclusivamente esta tabla nueva, con un formulario simple: Fecha, RUC, Proveedor, Número, Valor, Detalle.

**No suma a `ResumenTalonario.js`** (ya no sumaba hoy tampoco) **ni a `saldoBanco.js`** (hoy sí restaba del saldo banco calculado si `forma_pago='20'` en la tabla vieja — desaparece junto con el campo, ya que la tabla nueva no tiene `forma_pago`).

**Excel:** la hoja "COMPRAS -PERSONAL" / "FACTURAS GASTOS PERSONALES" (mismo archivo, columnas Fecha/RUC/Proveedor/Número/Valor/Detalle) deja de alimentar `compras` (con `es_personal=true`) y pasa a alimentar esta tabla nueva directamente — incluyendo el mapeo de la columna Detalle, que hoy `parseComprasPersonal()` no captura (solo lee fecha/ruc/proveedor/numero/valor vía el parámetro `extra`).

**Diciembre 2025 (ya importado) no se toca** — las filas que ya están en `compras` con `es_personal=true` desde el import anterior se quedan ahí. El cambio de ruteo del Excel aplica solo para futuras importaciones.

**Tablas viejas (`talonario_facturas_personales`, `talonario_facturas_personales_items`)** dejan de usarse por la app — no se borran ni se migran, simplemente ningún código nuevo las referencia.

---

## 4. Pagos Fijos Personales — Servicio Básico

**Catálogo `pagos_fijos_personales` gana 2 campos nuevos:**
- `es_servicio_basico` (boolean, default false)
- `empresa` (text, nullable) — ej. "EMELNORTE", "EMAPA"

**Al registrar el pago de un servicio básico ese mes** (mismo botón "▶ Registrar" del catálogo), si `es_servicio_basico=true`, el formulario de registro pide además:
- **Forma de pago** (efectivo / banco)
- **Número de factura** (texto, opcional)

**Efectivo:** se crea automáticamente un gasto vinculado en `caja_gastos` de la fecha de registro (mismo patrón que los Adelantos de Nómina — buscar o crear `caja_chica` de esa fecha, insertar `caja_gastos` con un campo de vínculo nuevo, ej. `origen_pago_fijo_personal_id`), visible de solo lectura en Caja Chica, contando en "Gastos efectivo".

**Banco:** se crea automáticamente un pago vinculado en `talonario_pagos_banco` (mismo campo de vínculo), contando en "Pagos con banco".

**Eliminar el registro del mes** también borra el gasto/pago vinculado (mismo patrón de borrado en cascada que `eliminarMov` en Nómina).

---

## 5. Alerta anti-duplicado en Caja Chica

Cuando se escribe un gasto manual en Caja Chica (`proveedor` o `detalle`), si el texto escrito contiene el nombre, concepto, o empresa de algún "Pago Fijo Personal" marcado `es_servicio_basico=true` (comparación simple, sin distinguir mayúsculas/minúsculas, contra los servicios básicos ya creados en el catálogo — no contra una lista fija de palabras genéricas), se muestra una alerta indicando que ese pago debe registrarse como Servicio Básico en el Talonario (Pagos Personales) en lugar de como un gasto manual de Caja Chica, para evitar contarlo dos veces.

---

## 6. Resumen — Servicio Básico se excluye de Pagos Personales

**Lado MES (izquierdo):** el monto de los pagos fijos marcados `es_servicio_basico=true` y registrados ese mes sale de `totalPagosPersonalesTotal` (ya no cuenta como `gastos_personal`/`otros`) y se suma a la línea ya existente "(-) Pagos Fijos (sistema, servicios, contadora, etc.)" (`totalPagosFijos`).

**Lado CONSOLIDADO (derecho):** mismo criterio — sale de `pagosGastPersTotal` y se suma a "(-) Gastos efectivo" o "(-) Pagos con banco" según la forma de pago elegida al registrarlo.

Las 2 líneas de Pagos Personales (MES y CONSOLIDADO) siguen mezclando `gastos_personal` + `otros` en una sola línea cada una, sin separarlas — esto no cambia.

---

## Resumen de cambios por archivo

- **Nueva migración SQL:** `talonario_registro_facturas_dueno` (tabla nueva); `pagos_fijos_personales.es_servicio_basico`, `pagos_fijos_personales.empresa`; columna de vínculo nueva en `caja_gastos` y `talonario_pagos_banco` para servicio básico (ej. `origen_pago_fijo_personal_id`).
- **`PagosPersonales.js`:** quitar exclusión de pagos fijos registrados; mover vista de `compras.es_personal=true` aquí; Caja Chica `es_personal` cambia de categoría a `'otros'`; formulario de registro de pago fijo gana forma de pago + número de factura cuando es servicio básico, con su routing a Caja Chica/Banco.
- **`FacturasPersonales.js`:** reescribir para usar la tabla nueva (`talonario_registro_facturas_dueno`) en vez de `talonario_facturas_personales` + `compras.es_personal=true`.
- **`TabCajaChica.js`:** alerta de texto al escribir un gasto manual que coincide con un servicio básico registrado; mostrar gasto vinculado de servicio básico (mismo patrón ya usado para adelantos de nómina).
- **`importExcelHistorial.js`:** `parseComprasPersonal()` agrega el mapeo de la columna Detalle; `ejecutarImport()` enruta esos datos a la tabla nueva en vez de `compras`.
- **`ResumenTalonario.js`:** excluir servicio básico de Pagos Personales (MES y CONSOLIDADO), sumarlo a Pagos Fijos (MES) y Gastos efectivo/Pagos con banco (CONSOLIDADO) según forma de pago.
- **`saldoBanco.js`:** quitar la consulta a `talonario_facturas_personales` (ya no aplica, la tabla nueva no tiene forma de pago).
