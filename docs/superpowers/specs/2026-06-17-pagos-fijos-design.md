# Pagos Fijos — Design Spec

**Goal:** Permitir configurar pagos recurrentes mensuales (IESS, contadora, servicios, etc.) que aparezcan pre-cargados en "Pagos del Mes" cada mes, con asiento automático en libro diario.

**Architecture:** Nueva tabla `pagos_fijos` + columna `pago_fijo_id` en `talonario_pagos_banco`. UI dentro de PagosDelMes.js con sección de administración y sección de registro mensual. Asiento automático en `asientosContables.js`.

**Tech Stack:** React, Supabase/PostgREST, asientosContables.js existente.

---

## Base de datos

### Tabla nueva: `pagos_fijos`

```sql
CREATE TABLE pagos_fijos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL,
  codigo         text NOT NULL,          -- ej: "IESS", "CONT", "LUZ", "ARR"
  monto_default  numeric DEFAULT 0,
  forma_pago     text DEFAULT 'transferencia',
  cuenta_debe_key text NOT NULL,         -- 'iess_pagar_id' | 'sueldos_pagar_id' | 'gasto_caja_id'
  activo         boolean DEFAULT true,
  orden          int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
```

### Columna nueva en `talonario_pagos_banco`

```sql
ALTER TABLE talonario_pagos_banco ADD COLUMN pago_fijo_id uuid REFERENCES pagos_fijos(id);
```

Permite saber si un pago del mes fue generado desde un pago fijo o fue ingresado manualmente.

---

## Cuentas DEBE disponibles

| cuenta_debe_key   | Cuenta contable       | Cuándo usar                        |
|-------------------|-----------------------|------------------------------------|
| `iess_pagar_id`   | IESS por Pagar        | Pago mensual del IESS              |
| `sueldos_pagar_id`| Sueldos por Pagar     | Pago de sueldos pendientes         |
| `gasto_caja_id`   | Gastos Generales      | Contadora, servicios, arriendo, etc|

HABER siempre es `banco_id`.

---

## UI — PagosDelMes.js

### Botón "⚙️ Administrar fijos"
- Aparece en la cabecera de la página
- Abre modal con tabla CRUD de `pagos_fijos`
- Columnas: Código | Nombre | Monto default | Forma pago | Cuenta DEBE | Activo | Acciones
- Permite agregar, editar, activar/desactivar

### Sección "Pagos Fijos del Mes" (encima de la tabla manual)
- Carga todos los `pagos_fijos` activos
- Para cada uno verifica si ya existe un `talonario_pagos_banco` con ese `pago_fijo_id` en el mes/año actual
- **No registrado:** muestra fila con monto pre-llenado (editable), botón "Registrar"
- **Ya registrado:** muestra ✅ con monto guardado, botón editar. Al editar el monto → actualiza `talonario_pagos_banco` y el asiento en libro diario (elimina el anterior e inserta uno nuevo)

---

## Libro diario — asiento automático

Al registrar un pago fijo para el mes, se genera automáticamente:

```
DEBE  [cuenta_debe_key]   $XXX   "[CODIGO] — [Mes Año]"   (ej: "IESS — Jun 2026")
HABER banco_id            $XXX   "[CODIGO] — [Mes Año]"
```

Nueva función en `asientosContables.js`:
```js
generarAsientoPagoFijo({ id, monto, codigo, cuenta_debe_key, mes, año })
```

- `origen`: `'talonario_pagos_banco'`
- `origen_id`: id del registro creado en talonario_pagos_banco
- `tipo`: `'tributario'`

---

## Flujo completo

```
1. Admin configura pagos_fijos una sola vez (IESS/CONT/LUZ...)
2. Cada mes → abre Pagos del Mes
3. Ve los pagos fijos pre-cargados con monto default
4. Ajusta monto si cambió ese mes
5. Clic "Registrar" → crea fila en talonario_pagos_banco con pago_fijo_id
6. Se genera asiento: DEBE [cuenta] / HABER Banco con descripción "CONT — Jun 2026"
7. Aparece en ResumenTalonario CONSOLIDADO → "Pagos con banco" (ya incluye talonario_pagos_banco)
8. Aparece en MovimientosBanco como salida
```

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| SQL migration | Crear tabla `pagos_fijos` + columna `pago_fijo_id` |
| `PagosDelMes.js` | Sección fijos + modal administrar |
| `asientosContables.js` | Nueva función `generarAsientoPagoFijo()` |

Sin cambios en ResumenTalonario, saldoBanco, MovimientosBanco — ya leen `talonario_pagos_banco` completo.
