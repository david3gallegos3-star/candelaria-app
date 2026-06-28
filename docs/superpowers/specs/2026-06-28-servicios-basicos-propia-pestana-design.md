# Servicios Básicos como pestaña propia en Egresos — Design Spec

**Goal:** Mover "Servicio Básico" de ser un flag dentro del catálogo de Pagos Fijos Personales a ser su propia pestaña de primer nivel en EGRESOS, con vínculo a MOD/CIF (costeo de manufactura) y asiento contable formal — igual al patrón ya usado por los pagos fijos de empresa en "Pagos del Mes", pero agregándole la rama "efectivo va a Caja Chica" que ese patrón nunca tuvo.

**Architecture:** Tabla nueva y dedicada (`pagos_fijos_servicios_basicos`) para el catálogo. El registro mensual ya NO pasa por una tabla intermedia tipo `talonario_pagos_personales` — va directo a `caja_gastos` (efectivo) o `talonario_pagos_banco` (banco), igual al patrón de `pagos_fijos`/`PagosDelMes.js`. Esto elimina la clase de bug de doble conteo encontrada ayer (no hay fuente duplicada). Se extiende `generarAsientoPagoFijo()` para soportar la rama efectivo (Caja Chica) además de banco, reutilizando exactamente el patrón ya usado en `generarAsientoNomina()`.

**Tech Stack:** React, Supabase/PostgREST.

**Fuera de alcance (explícitamente acordado):**
- Migrar los datos de prueba creados ayer en `pagos_fijos_personales` con `es_servicio_basico=true` — David los recreará a mano en la pestaña nueva.
- Borrar las columnas `es_servicio_basico`/`empresa` de `pagos_fijos_personales` y `origen_pago_personal_id` de `caja_gastos`/`talonario_pagos_banco` (las de ayer) — quedan sin uso pero no se eliminan en esta iteración (nullable, no estorban).

---

## 1. Tabla nueva: catálogo de Servicios Básicos

`pagos_fijos_servicios_basicos`:
- `id` (uuid, PK)
- `nombre` (text)
- `empresa` (text, nullable) — ej. "EMELNORTE", "EMAPA"
- `monto_default` (numeric)
- `forma_pago` (text) — código SRI ('01' efectivo, '16'/'19'/'20' banco), igual convención que el resto del Talonario
- `tipo_mod_cif` (text, nullable) — 'directa' | 'indirecta' | 'cif' | null
- `mod_cif_row_id` (uuid, nullable) — referencia a `mod_directa`, `mod_indirecta`, o `cif_items` según `tipo_mod_cif`
- `orden` (integer)
- `activo` (boolean, default true)

## 2. Tablas existentes — columna de vínculo nueva

`caja_gastos` y `talonario_pagos_banco` ganan `origen_servicio_basico_id` (uuid, nullable, FK a `pagos_fijos_servicios_basicos(id)`, `ON DELETE SET NULL`) — mismo patrón que `origen_nomina_movimiento_id`/`origen_pago_personal_id` ya existentes.

## 3. Pestaña nueva "Servicios Básicos" en EGRESOS

Componente nuevo `ServiciosBasicos.js`, agregado al menú EGRESOS (junto a Gastos Efectivo, Pagos del Mes, Pagos Personales). Estructura idéntica al patrón "⚙️ Administrar fijos" de `PagosDelMes.js`:

- **Catálogo** (modal "Administrar"): nombre, empresa, monto default, forma de pago, vínculo MOD/CIF (mismo selector ya usado en `PagosDelMes.js`: tipo + fila existente o "crear nueva"), orden, activo.
- **Tabla "Servicios Básicos del Mes"**: para cada servicio activo sin registro este mes, fila con input de monto + input de número de factura + botón "▶ Registrar". Una vez registrado, desaparece de esta tabla (mismo comportamiento ya simplificado ayer para Pagos Fijos Personales).
- **Registro de un mes ya hecho**: se muestra con su monto y número de factura, con botón "✏️ Editar" (permite corregir el monto/número de factura de ese mes — al guardar, actualiza la fila vinculada, borra y regenera el asiento contable, y vuelve a sincronizar MOD/CIF, mismo patrón que `guardarEdicionFijo()` en `PagosDelMes.js`) y botón eliminar que borra la fila vinculada directamente.

### Al registrar (`registrarServicioBasico(fijo, monto, numeroFactura)`):

- **Si `forma_pago === '01'` (efectivo):** busca o crea la `caja_chica` de la fecha de hoy; inserta `caja_gastos` (`proveedor: fijo.empresa || fijo.nombre`, `detalle: fijo.nombre`, `valor: monto`, `es_personal: false`, `numero_factura: numeroFactura`, `origen_servicio_basico_id: fijo.id`).
- **Si no (banco):** inserta `talonario_pagos_banco` (`mes, año, fecha: hoy, concepto: fijo.nombre, beneficiario: fijo.empresa || fijo.nombre, monto, numero_factura: numeroFactura, origen_servicio_basico_id: fijo.id`).
- **Asiento contable:** llama a `generarAsientoPagoFijo()` (extendida, ver sección 4) pasándole la forma de pago.
- **MOD/CIF:** llama a `syncModCifRow(fijo, monto)` (función ya existente, sin cambios).

### Nota sobre `caja_gastos`/`talonario_pagos_banco`: campo `numero_factura`

`caja_gastos` no tiene hoy un campo `numero_factura` — se agrega (text, nullable) como parte de la migración de esta tarea. `talonario_pagos_banco` tampoco lo tiene — se agrega igual.

## 4. Extender `generarAsientoPagoFijo()` para soportar efectivo

Hoy (`asientosContables.js`), `generarAsientoPagoFijo()` siempre acredita `cuentas.banco_id`. Se extiende para aceptar un parámetro `formaPago`, y elegir entre `cuentas.caja_chica_id` (si `formaPago === '01'`) o `cuentas.banco_id` (cualquier otro valor) como cuenta HABER — mismo patrón ya usado en `generarAsientoNomina()` para esa misma distinción. Esto no cambia el comportamiento de los pagos fijos de empresa existentes (`PagosDelMes.js` sigue llamando la función sin ese parámetro, o pasando un valor que resuelva a banco).

## 5. Caja Chica — alerta y vínculo

`TabCajaChica.js`:
- El catálogo para la alerta anti-duplicado (`cargarServiciosBasicos`) pasa a consultar `pagos_fijos_servicios_basicos` en vez de `pagos_fijos_personales.eq('es_servicio_basico', true)`.
- La sección de solo lectura y la protección del autoguardado destructivo pasan a filtrar por `origen_servicio_basico_id` en vez de `origen_pago_personal_id`.

## 6. Resumen

`ResumenTalonario.js`: con el diseño de "un solo salto" (sin tabla intermedia), el cálculo se simplifica respecto a ayer:
- **MES:** `totalServicioBasico` = suma de `caja_gastos` + `talonario_pagos_banco` del mes donde `origen_servicio_basico_id` no es nulo. Se suma a `totalPagosFijos`. `totalGastosMes` sigue excluyendo la porción efectivo de `totalGastos` (igual patrón que ayer, ya que `totalGastos` es compartido con CONSOLIDADO).
- **CONSOLIDADO:** sin cambios necesarios — ya se cuenta automáticamente vía "Gastos efectivo" (`totalGastos`, genérico) y "Pagos con banco" (`totalPagosB`, genérico), exactamente igual que ayer. Ya no hace falta excluir nada de `pagosGastPers` (esa exclusión existía solo porque ayer había una fila duplicada en `talonario_pagos_personales` — ya no existe).

## 7. Pagos Gastos Personales — revertir lo de ayer

`PagosPersonales.js`:
- Se quita el checkbox "Es Servicio Básico" y el campo "Empresa" del modal de catálogo de Pagos Fijos Personales (`VACIO_FIJO`, el formulario, `guardarFijo()`).
- Se quita la lógica de vínculo a Caja Chica/Banco de `registrarPagoFijo()` (vuelve a ser un insert simple en `talonario_pagos_personales`, como antes de ayer).
- Se quita la columna "Nº Factura" de la tabla de catálogo (ya no aplica ahí).
- `eliminar()` deja de borrar en cascada `caja_gastos`/`talonario_pagos_banco` por `origen_pago_personal_id` (ya no se crean esos vínculos desde aquí).

## 8. Excel / importación histórica

Fuera de alcance — el Excel histórico no tiene una hoja específica de "Servicios Básicos" identificada todavía; no se modifica `importExcelHistorial.js` en esta iteración.

---

## Resumen de cambios por archivo

- **Nueva migración SQL:** tabla `pagos_fijos_servicios_basicos`; columnas `origen_servicio_basico_id` en `caja_gastos` y `talonario_pagos_banco`; columna `numero_factura` en `caja_gastos` y `talonario_pagos_banco`.
- **Nuevo componente:** `src/components/contabilidad/talonario/egresos/ServiciosBasicos.js`.
- **`TabTalonario.js`:** nueva entrada de menú "Servicios Básicos" dentro de EGRESOS.
- **`asientosContables.js`:** `generarAsientoPagoFijo()` acepta `formaPago` opcional, elige cuenta HABER (caja chica vs banco).
- **`TabCajaChica.js`:** alerta y vínculo migran de `pagos_fijos_personales`/`origen_pago_personal_id` a `pagos_fijos_servicios_basicos`/`origen_servicio_basico_id`.
- **`ResumenTalonario.js`:** cálculo de servicio básico simplificado (sin necesidad de excluir de `pagosGastPers`, ya no hay duplicado).
- **`PagosPersonales.js`:** revertir el flag/campo/lógica de servicio básico agregados ayer.
