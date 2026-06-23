# Importar Historial Excel al Talonario — Design Spec

**Goal:** Permitir subir el Excel mensual que entrega la contadora (formato fijo de 9 hojas) y que el sistema reparta cada fila en la tabla correcta del Talonario automáticamente, para poblar meses históricos sin tener que digitar todo a mano.

**Architecture:** Botón "📤 Subir Historial Excel" (renombrado del actual placeholder "Subir Excel" del Talonario) → parser client-side (librería `xlsx`, ya dependencia del proyecto) → validación completa (Fase 1, sin tocar la base de datos) → inserción con reversión manual si falla (Fase 2) → reporte de resultado.

**Tech Stack:** React, librería `xlsx` (ya usada en `TabPagosUnificado.js` para exportar ATS), Supabase/PostgREST.

**Fuera de alcance (explícitamente acordado):**
- No genera asientos en el Libro Diario para los meses importados — solo llena Talonario/Resumen.
- No hay pantalla de vista previa antes de confirmar — se inserta directo si la validación pasa, y el usuario revisa después yendo al mes importado en el Talonario.
- La hoja RESUMEN del Excel nunca se inserta — solo se usa para detectar el mes/año y como referencia de comparación manual posterior.
- No incluye la futura función de subir el Excel de movimientos del SRI (eso será un botón separado "Subir Excel SRI", parte 2 ya documentada en memoria de proyecto, pospuesta).

---

## 1. Detección automática de mes/año

La celda `A1` de la hoja `RESUMEN` tiene el formato `"<MES> DEL <AÑO>"` (ej. `"DICIEMBRE DEL 2025"`). Se parsea con una tabla de meses ES (`ENERO`..`DICIEMBRE` → 1..12). Si el texto no calza con ese patrón, se aborta el import con el error: *"No pude leer el mes/año de la hoja RESUMEN — revisa que la celda A1 diga '<MES> DEL <AÑO>'."*

---

## 2. Mapeo hoja → tabla destino

Confirmado por cruce numérico real contra un Excel de diciembre 2025 (cada total reconcilia exacto contra su línea correspondiente en RESUMEN, salvo donde se indica).

| Hoja Excel | Sub-tablas dentro de la hoja | Tabla(s) destino | Notas |
|---|---|---|---|
| `GASTOS` | 1 tabla (cols B-E: Proveedor/Fecha/Detalle/Valor) | `caja_chica` + `caja_gastos` | Siempre `es_personal=false` — la contadora no separa "personal" por texto aquí, todo entra al mismo total devengado |
| `COBROS EFECTIVO` | 1 tabla | `cobros` (`forma_pago='efectivo'`) | |
| `COBROS CHEQUES` | 1 tabla | `cobros` (`forma_pago='cheque'`) | |
| `COBROS TRANSF DEPO` | 2 tablas lado a lado: Transferencia (cols B-G) y Depósito/Tarjeta (cols J-O) | `cobros` (`forma_pago='transferencia'` / `'deposito'`/`'tarjeta_credito'` según fila) | Cada bloque de columnas se lee y excluye su propia fila TOTAL por separado (bug real encontrado y corregido durante el análisis: una sola fila TOTAL del bloque corto invalidaba una fila válida del bloque largo) |
| `PAGOS DICIEMBRE` | 1 tabla (cols B-D: Beneficiario/Fecha/Valor) | `talonario_pagos_banco` | Mezcla proveedores/sueldos/mantenimiento/contadora sin distinguir — igual que ya lo trata esa pestaña hoy |
| `OTROS PAGOS PERSONALES` | 3 tablas: "Préstamo y Tarjeta" y "Gastos Personales" apiladas verticalmente en cols B-D (separadas por su propia fila TOTAL + nuevo encabezado), y "Otros Gastos Personales" en cols H-J de corrido | `talonario_pagos_personales` | "Préstamo y Tarjeta" → categoría `tarjetas` (catch-all; no se distingue de `prestamos` fila por fila porque el Resumen y la pantalla de Pagos Personales ya las suman juntas en una sola línea/sección, así que no afecta ningún total visible). "Gastos Personales" → categoría `gastos_personal`. "Otros Gastos Personales" → categoría `otros` |
| `COMPRAS` | 2 tablas lado a lado: Con factura (cols A-E) y Sin factura (cols I-K) | `compras` (`es_personal=false`) | `tiene_factura=true/false` según el bloque; `forma_pago='credito'` siempre (el Excel no trae esa columna) |
| `COMPRAS -PERSONAL` | 1 tabla (cols A-F: Fecha/RUC/Proveedor/Número/Valor/Detalle) | `compras` (`es_personal=true`) | Va a "Facturas Personales"; se confirmó por cruce cruzado (nombre+monto contra las otras 8 hojas) que esta hoja **no** se refleja en el RESUMEN de la contadora — es respaldo aparte. `forma_pago='credito'` siempre |

`RESUMEN` no aparece en esta tabla — nunca se inserta, solo se lee para el mes/año.

---

## 3. Validación (Fase 1 — nunca escribe en la base de datos)

Antes de insertar nada, se recorren las 9 hojas y se valida:

1. Existen las 9 hojas con esos nombres exactos (incluyendo el espacio en `"COMPRAS "` y `"COMPRAS -PERSONAL"`, tal cual los nombra el archivo real).
2. La celda de mes/año en RESUMEN es parseable.
3. **No existen ya datos cargados para ese mes/año** en `caja_chica`, `cobros` (por rango de fecha), `talonario_pagos_banco`, `talonario_pagos_personales`, `compras` (por rango de fecha) — para evitar duplicar un import ya hecho.
4. Cada fila de cada hoja tiene: fecha parseable, monto parseable y mayor a 0, proveedor/cliente no vacío.

Si cualquier punto falla, se aborta con un mensaje específico: hoja, número de fila, y qué está mal (ej. *"Fila 45 de COBROS EFECTIVO: el monto no es un número válido"* o *"Ya existe información cargada para Diciembre 2025 en Caja Chica — bórrala primero si quieres reimportar"*). Nada se guarda.

---

## 4. Inserción (Fase 2 — todo o nada)

Solo si la Fase 1 pasa al 100%:

1. Se resuelven proveedores/clientes: por RUC o nombre exacto contra `proveedores`/`clientes`; si no existe, se crea automáticamente con los datos de la fila.
2. Se insertan las filas hoja por hoja, en el orden de la tabla de la sección 2, guardando en memoria el id de cada fila creada (incluyendo proveedores/clientes nuevos).
3. Si cualquier insert falla a mitad de camino, se borran (en orden inverso) todos los registros ya creados en ese intento — dejando la base de datos exactamente como estaba antes de empezar — y se muestra el error puntual.
4. Si todo se inserta bien, se muestra un resumen de conteos por hoja (ej. *"187 gastos, 45 cobros efectivo, 12 cobros cheque..."*) y se navega al mes importado dentro del Talonario para que el usuario lo compare visualmente contra el Excel.

---

## 5. UI

- El botón actual "Subir Excel" en la cabecera del Talonario se renombra a **"📤 Subir Historial Excel"**.
- Al hacer clic: selector de archivo `.xlsx` → procesa Fase 1 y Fase 2 en cadena → modal de error (si aplica, sin loader bloqueante largo) o modal de éxito con el resumen de conteos.
- Sin pantalla de vista previa intermedia — decisión explícita del usuario: prefiere revisar después en el propio Talonario del mes importado en lugar de una pantalla de confirmación previa.

---

## Notas técnicas de parsing (para la implementación)

- Usar `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })` por hoja para obtener filas como arrays (no objetos), ya que varias hojas tienen encabezados duplicados/combinados.
- **Cuidado con las filas TOTAL**: cada hoja/sub-tabla termina con una fila que repite la palabra "TOTAL" — deben excluirse explícitamente por bloque de columnas, no por fila completa (ver nota de `COBROS TRANSF DEPO` arriba).
- Limpieza de montos: quitar todo excepto dígitos, punto y signo menos antes de `parseFloat` (los montos vienen como `" $1,234.56 "` con espacios y símbolo de moneda).
- **Formato de fecha — no es uniforme, ni siquiera dentro de la misma hoja.** Verificado celda por celda:
  - `GASTOS`, `PAGOS DICIEMBRE`, `OTROS PAGOS PERSONALES`, `COMPRAS -PERSONAL`, y el bloque "sin factura" de `COMPRAS ` → `M/D/YY` (ej. `12/3/25` = 3 de diciembre).
  - `COBROS EFECTIVO`, `COBROS CHEQUES`, `COBROS TRANSF DEPO` (ambos bloques), y el bloque "con factura" de `COMPRAS ` → `DD/MM/YYYY` (a veces con comilla simple inicial forzando texto, a veces sin ella — la comilla NO es un indicador confiable del formato).
  - Regla de parseo segura: si el primer número es >12, es DD/MM forzosamente; si es ambiguo (ambos componentes ≤12), usar la convención fija de la hoja/bloque de la tabla anterior — no asumir un solo formato global.
