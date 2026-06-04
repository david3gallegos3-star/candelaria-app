# Diseño: Hotmail Sync — Búsqueda por mes y vista previa con categorización

**Fecha:** 2026-06-04  
**Estado:** Aprobado

## Resumen

Dos mejoras al módulo de sincronización Hotmail en el Talonario:
1. La sincronización busca emails en un rango amplio pero solo muestra estados del mes/año seleccionado en el Talonario
2. Antes de cargar al Talonario, el usuario ve todas las transacciones y elige por cada una si va a "Pagos Personales" o "Pagos del Mes (Empresa)"

---

## 1. Búsqueda inteligente por mes

### Problema actual
La edge function `leer-emails-banco` siempre busca los últimos 45 días desde hoy, sin importar qué mes tiene seleccionado el usuario en el Talonario.

### Solución
- El frontend pasa `mes` y `año` del TalonarioContext a la edge function
- La edge function construye un rango de búsqueda amplio: desde 30 días antes del 1ro del mes hasta el último día del mes seleccionado
- Los emails se procesan normalmente (Claude extrae `periodo_mes` y `periodo_año`)
- Solo se almacenan/muestran los `bank_statements` donde `periodo_mes = mes` y `periodo_año = año`

### Ejemplo
Usuario selecciona Junio 2026:
- Rango de búsqueda de emails: May 1 → Jun 30 2026
- Estado Pichincha período May 22–Jun 21 → `periodo_mes=6` → **aparece**
- Estado Produbanco período Jun 1–30 → `periodo_mes=6` → **aparece**
- Estado de Mayo → `periodo_mes=5` → **no aparece**

### Cambios requeridos

**`HotmailSync.js`:**
- Leer `mes` y `año` desde `useTalonario()`
- Pasar `{ mes, año }` al invocar `leer-emails-banco`
- Mostrar en el botón: "Sincronizar Junio 2026" en lugar de "Sincronizar estados de cuenta"

**`leer-emails-banco/index.ts`:**
- Recibir `mes` y `año` del body
- Calcular `fechaDesde` = primer día del mes anterior al mes seleccionado (30 días de margen)
- Calcular `fechaHasta` = último día del mes seleccionado
- Filtrar inserts y reads de `bank_statements` por `periodo_mes = mes` y `periodo_año = año`

---

## 2. Vista previa con categorización por transacción

### Flujo actual
Al detectar un estado de cuenta, aparece una tarjeta con botón "Cargar al Talonario" que carga todo automáticamente a `talonario_pagos_personales`.

### Flujo nuevo
1. El estado aparece con botón **"Ver transacciones"** en lugar de "Cargar al Talonario"
2. Al hacer clic → se abre un panel/modal con la lista de todas las transacciones
3. Por cada transacción el usuario elige:
   - **Personal** → `talonario_pagos_personales` (categoría: `gastos_personal`)
   - **Empresa** → `talonario_pagos_banco`
4. Botón **"Cargar seleccionadas"** → carga todas a sus respectivas tablas y marca el estado como `cargado`

### Categorización inteligente (pre-selección)
La IA (Claude Haiku) ya clasifica cada transacción con `tipo_transaccion`:
- `consumo` → pre-seleccionar **Personal** (el usuario puede cambiar)
- `diferido` → pre-seleccionar **Personal**
- `pago` → no se carga (pagos al banco, ya está implementado)
- `prestamo` → pre-seleccionar **Empresa**

El usuario puede cambiar cualquier pre-selección antes de confirmar.

### Destinos de carga

| Elección | Tabla | Campos relevantes |
|---|---|---|
| Personal | `talonario_pagos_personales` | mes, año, fecha, beneficiario, concepto, monto, categoria=`gastos_personal`, forma_pago=`20` |
| Empresa | `talonario_pagos_banco` | mes, año, monto, comentario (descripción de la transacción) |

### Cambios requeridos

**`HotmailSync.js`:**
- Nuevo estado: `modalTransacciones` (el bank_statement que se está previsualizando)
- Nuevo estado: `categorias` (map de `transacción_index → 'personal' | 'empresa'`)
- Reemplazar botón "Cargar al Talonario" por "Ver transacciones"
- Nuevo componente `ModalTransacciones` inline: lista cada transacción con toggle Personal/Empresa
- Botón "Cargar seleccionadas" invoca edge function con las categorías elegidas

**`cargar-estado-cuenta/index.ts`:**
- Recibir array `categorias: { index: number, destino: 'personal' | 'empresa' }[]`
- Para cada transacción con `destino='personal'` → insert en `talonario_pagos_personales`
- Para cada transacción con `destino='empresa'` → insert en `talonario_pagos_banco`
- Omitir transacciones de tipo `pago` (sin importar el destino elegido)
- Marcar `bank_statement.estado = 'cargado'`

### Estructura de `talonario_pagos_banco`
Verificar campos existentes antes de insertar. Los campos mínimos esperados: `mes`, `año`, `monto`, `comentario` (o similar). Si la tabla tiene campos adicionales requeridos, ajustar en el plan de implementación.

---

## 3. Lo que NO cambia

- El proceso de extracción con Claude Haiku (igual)
- La tabla `bank_statements` (igual)
- El token global de Hotmail (recién implementado)
- Los estados `procesado` / `cargado` del bank_statement

---

## 4. Flujo completo resumido

```
Usuario en Talonario → selecciona Junio 2026 → pestaña HOTMAIL
        ↓
Clic "Sincronizar Junio 2026"
        ↓
Busca emails May 1 – Jun 30 → Claude extrae → filtra periodo_mes=6
        ↓
Muestra tarjetas de estados detectados con botón "Ver transacciones"
        ↓
Usuario abre modal → ve lista con toggle Personal/Empresa por transacción
        ↓
Clic "Cargar seleccionadas"
        ↓
Personal → talonario_pagos_personales
Empresa  → talonario_pagos_banco
Estado   → marcado como 'cargado'
```
