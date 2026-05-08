# Wizard Producción Dinámica — CORTES
**Fecha:** 2026-05-08  
**Estado:** Aprobado — listo para implementar

---

## Contexto

Los bloques dinámicos de Costos 1kg (Fase 1) ya están implementados y guardados en `vista_horneado_config.config.bloques`. La Fase 2 conecta ese motor con la pestaña Producción: el wizard de registro sigue exactamente el orden de bloques configurados.

Solo afecta categoría **CORTES**. No toca Ahumadas, Marinados ni Inmersión.

---

## Arquitectura

### Archivos nuevos
- `src/components/produccion/WizardProduccionDinamica.js` — wizard completo, autocontenido

### Archivos modificados (cambios mínimos)
- `src/components/produccion/TabMaduracion.js` — 2 cambios quirúrgicos:
  1. Momento 1: si `config.bloques` existe → abrir `WizardProduccionDinamica` (modo `momento1`) en lugar del flujo clásico de inyección
  2. Momento 2: si el lote tiene `bloques_resultado` → abrir `WizardProduccionDinamica` (modo `momento2`) en lugar del `cortesWizard` clásico

### Sin tocar
Ahumadas, Marinados, Inmersión, Deshuese clásico, cualquier lote sin `bloques_resultado`.

---

## Modelo de datos

### Campo nuevo: `lotes_maduracion.bloques_resultado` (JSONB)

Persiste el estado del wizard entre Momento 1 y Momento 2.

```json
// Estado al terminar Momento 1
{
  "momento": "momento1_completado",
  "pasos": [
    { "tipo": "merma",     "kgEntrada": 2.0,  "kgSalida": 1.6,  "costoAcum": 18.4 },
    { "tipo": "inyeccion", "kgEntrada": 1.6,  "kgSalida": 1.92, "costoAcum": 19.5, "kgSalmuera": 0.32 }
  ],
  "kgPostMomento1": 1.92,
  "costoAcumMomento1": 19.5
}

// Estado al terminar Momento 2
{
  "momento": "completado",
  "pasos": [ ...todos los pasos con datos reales... ],
  "padre": { "kg": 1.42, "costo_kg": 13.73, "stock_id": "uuid-padre" },
  "hijo":  { "kg": 0.50, "costo_kg": 13.73, "stock_id": "uuid-hijo" }
}
```

### Stock movements (tablas existentes, sin cambios de esquema)

| Evento | Tabla | Operación |
|--------|-------|-----------|
| Inyección confirmada | `inventario_movimientos` + `inventario_mp` | salida salmuera (por ingrediente) |
| Rub confirmado | `inventario_movimientos` + `inventario_mp` | salida ingredientes rub (escalado) |
| Adicional confirmado | `inventario_movimientos` + `inventario_mp` | salida MP adicional |
| Merma tipo 3 confirmada | `inventario_movimientos` + `inventario_mp` | entrada MP nuevo |
| Fin padre | `stock_lotes_inyectados` | INSERT tipo_corte='padre' |
| Fin hijo | `stock_lotes_inyectados` | INSERT tipo_corte='hijo' con parent_lote_id |

### Migración Supabase

```sql
ALTER TABLE lotes_maduracion
  ADD COLUMN IF NOT EXISTS bloques_resultado JSONB;
```

---

## Flujo del wizard

### División por bloque `maduracion` como punto de corte

```
config.bloques (en orden)
  ├─ bloques ANTES de maduracion  → MOMENTO 1 (al crear lote)
  ├─ bloque maduracion            → primer paso de MOMENTO 2 (al registrar pesaje)
  └─ bloques DESPUÉS de maduracion → continuación MOMENTO 2 (rama padre)
       └─ bifurcacion             → divide en rama padre y rama hijo

config.bloques_hijo (todos) → MOMENTO 2, rama hijo (después de bifurcación)
```

### Estado interno del wizard

```javascript
{
  pasoIdx:    0,        // índice en pasosActivos (bloques activos del momento/rama)
  kgActual:   2.0,      // kg en proceso en este momento
  costoAcum:  18.4,     // costo acumulado hasta ahora
  resultados: [],       // pasos completados con datos reales del operario
  rama:       'padre',  // 'padre' | 'hijo' — activo después de bifurcación
  kgPadre:    null,     // seteado en bloque bifurcacion
  kgHijo:     null,
  costoPadreKg: null,
  costoHijoKg:  null,
}
```

### Indicador de progreso (igual que Ahumadas)

```
[✓ Merma] [✓ Inyección] [● Maduración] [○ Rub] [○ Bifurcación] | [○ Hijo-Merma] [○ Hijo-Rub]
```
- Completados: verde con ✓
- Actual: destacado con borde
- Pendientes: gris con ○
- Separador visual entre rama padre y rama hijo

---

## Comportamiento por tipo de bloque

### `merma` tipo 1 — Descarte total
- UI: muestra `% merma` y `kg estimado`. Solo botón "Confirmar".
- Operario: no ingresa nada.
- Sistema: calcula `kgSalida = kgActual × (1 - pct/100)`, costo se absorbe.

### `merma` tipo 2 — Valor recuperable
- UI: input de kg reales obtenidos. Muestra crédito generado en tiempo real.
- Operario: ingresa kg reales.
- Sistema: `credito = kgReal × precio_merma_kg`, reduce `costoAcum`.
- Stock: no va a inventario.

### `merma` tipo 3 — Genera nuevo producto
- UI: input de kg reales. Muestra MP destino y valor.
- Operario: ingresa kg reales.
- Sistema: igual que tipo 2 + entrada al inventario como MP.
- Stock: INSERT `inventario_movimientos` (entrada), UPDATE `inventario_mp`.

### `inyeccion`
- UI: muestra `kgSalmuera = kgActual × pct_inj/100`. Botón "Confirmar".
- Operario: solo confirma (puede editar kg si difiere).
- Sistema: `kgSalida = kgActual + kgSalmuera`, agrega costo salmuera.
- Stock: salida de ingredientes de la fórmula de salmuera (proporcional).

### `rub`
- UI: muestra escala `kgActual / kg_rub_base`, ingredientes y costo.
- Operario: puede editar kg reales usados.
- Sistema: agrega costo rub. kg no cambia.
- Stock: salida de ingredientes del rub (escalados).

### `adicional`
- UI: muestra `gramos/kg × kgActual = total`. Costo calculado.
- Operario: puede editar gramos reales.
- Sistema: agrega costo adicional. kg no cambia.
- Stock: salida de la MP adicional.

### `maduracion` (punto de corte Momento 1→2)
- UI: input de kg reales de salida. Muestra merma real vs esperada con código de color.
- Operario: ingresa kg reales después de maduración.
- Sistema: `kgSalida = kgReal`, calcula `mermaReal%` vs `mermaEsperada%`.

### `bifurcacion`
- UI: input de kg para padre. Auto-calcula kg hijo = kgActual - kgPadre.
- Operario: ingresa kg padre.
- Sistema: divide `costoAcum` proporcionalmente. Activa dos ramas.

---

## Pestaña Producción

El resumen del último lote muestra:
- Si `bloques_resultado` existe → lista pasos ejecutados con kg y costo real de cada uno
- Si flujo clásico → resumen clásico sin cambios

## Pestaña Historial

- Sin cambios estructurales
- Si lote tiene `bloques_resultado` → se puede expandir para ver los pasos ejecutados
- El más reciente marcado claramente (lógica existente)

---

## Orden de implementación

1. `WizardProduccionDinamica.js` — componente completo
2. Cambios en `TabMaduracion.js` — 2 puntos de entrada
3. Migración SQL — agregar columna `bloques_resultado`
4. Actualizar vista Producción — mostrar `bloques_resultado`
5. Actualizar vista Historial — expandir pasos ejecutados
