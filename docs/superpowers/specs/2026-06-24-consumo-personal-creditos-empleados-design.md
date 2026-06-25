# Consumo Personal y Créditos Empleados en el Resumen — Design Spec

**Goal:** Agregar al Talonario/Resumen dos categorías que la contadora ya lleva en su propio resumen mensual pero que la app no refleja hoy: (1) consumo personal de producto propio de la fábrica (sin movimiento de efectivo), y (2) créditos a empleados liquidados vía nómina.

**Architecture:** Consumo Personal es una tabla nueva, ligera, sin relación con pagos/caja, leída desde una sección nueva dentro de la pestaña "Pagos Personales" del Talonario y sumada en el Resumen lado MES. Créditos Empleados no requiere tabla nueva — reutiliza `nomina_movimientos`/`cuentas_cobrar` ya existentes, solo agrega una consulta y una línea nueva en el Resumen lado CONSOLIDADO.

**Tech Stack:** React, Supabase/PostgREST, componente `SelectBuscable.js` ya existente para elegir producto del catálogo.

**Fuera de alcance (explícitamente acordado):**
- Consumo Personal NO resta del inventario de productos terminados (`inventario_produccion`) por ahora. Se confirmó durante el diseño que las ventas normales (facturas/notas de venta) tampoco restan ese inventario hoy — es un hueco de fondo, más grande, que David decidió resolver después en una conversación aparte, para ventas y consumo personal juntos (ver memoria de proyecto `project_inventario_ventas_gap`).
- No se modifica la lógica existente de `credito_nomina` en `TabNuevaVenta.js` ni la liquidación en `TabNomina.js` — Créditos Empleados solo agrega visibilidad en el Resumen, no cambia el flujo ya construido.

---

## 1. Consumo Personal - Producto Casa

**Qué registra:** cada vez que el dueño (o alguien más) se lleva producto de la fábrica para consumo personal, sin pagar — un costo real (inventario usado sin venderse) pero sin movimiento de efectivo.

**Tabla nueva:** `talonario_consumo_personal`
- `id` (uuid, PK)
- `mes`, `año` (integer)
- `fecha` (date)
- `producto_nombre` (text) — elegido del catálogo de productos vía `SelectBuscable.js` (mismo selector que ya usa Nueva Venta)
- `cantidad` (numeric) — se guarda desde ya, aunque no resta inventario todavía, para no tener que rediseñar el formulario cuando se conecte el inventario más adelante
- `valor` (numeric) — escrito a mano cada vez, sin cálculo automático
- `detalle` (text, opcional) — nota libre
- `created_at` (timestamptz, default now())

**UI:** nueva sección dentro de la pestaña existente "Pagos Personales" del Talonario (`PagosPersonales.js`), al mismo nivel que las secciones ya existentes ("Pagos Préstamo y Tarjeta", "Pagos Gastos Personales", "Otros Pagos Personales"). Formulario simple: fecha, selector de producto, cantidad, valor, detalle, botón guardar. Lista de registros del mes con opción de editar/eliminar, igual que las otras secciones de esa pantalla.

**Resumen:** nueva línea "(-) Consumo Personal" en el lado **MES (izquierdo)** únicamente — suma de `valor` de `talonario_consumo_personal` para el mes/año actual. No aparece en el lado CONSOLIDADO (derecho), porque no hubo movimiento de efectivo real.

---

## 2. Créditos Empleados

**Qué refleja:** cuando un empleado compra producto a `forma_pago='credito_nomina'` (ya existente en `TabNuevaVenta.js`) y esa deuda se liquida al generar la nómina mensual del empleado (ya existente en `TabNomina.js`, marca la `cuentas_cobrar` correspondiente como `'pagada'`), ese valor debe aparecer en el Resumen del mes en que se liquidó — no antes.

**Sin tabla nueva.** Se agrega una consulta en `ResumenTalonario.js`:
- Leer `nomina_movimientos` donde `tipo='compra'`, `activo=true` (si está en `false`, ese descuento se desactivó para ese período y no debe contarse — opción que ya existe en `TabNomina.js`), y `periodo` corresponde al mes/año del Resumen.
- Para cada uno, confirmar que su `cuentas_cobrar` vinculada (`cxc_id`) tiene `estado='pagada'` (es decir, que la nómina de ese período ya se generó y efectivamente liquidó esa deuda — si la nómina de ese mes aún no se generó, el movimiento existe pero no debe contarse todavía).
- Sumar el campo `valor` de los movimientos que cumplen las tres condiciones.

**Resumen:** nueva línea "(-) Créditos Empleados" en el lado **CONSOLIDADO (derecho)** únicamente, dentro de la sección EGRESOS — igual que lo muestra la contadora. No aparece en el lado MES (izquierdo), porque la venta al empleado ya se contó ahí como una venta normal (`facturas`) al momento de emitirse; mostrarlo de nuevo en MES duplicaría el monto.

---

## Resumen de cambios por archivo

- **Nueva migración SQL:** crear tabla `talonario_consumo_personal`.
- **`PagosPersonales.js`:** nueva sección "Consumo Personal - Producto Casa" (formulario + lista + CRUD), siguiendo el patrón ya usado por las otras 3 secciones de esa misma pantalla.
- **`ResumenTalonario.js`:**
  - Lado MES: nueva consulta a `talonario_consumo_personal`, nueva línea "(-) Consumo Personal", sumada a `totalEgrMes`.
  - Lado CONSOLIDADO: nueva consulta a `nomina_movimientos` + `cuentas_cobrar`, nueva línea "(-) Créditos Empleados", sumada a `totalEgrCons`.
