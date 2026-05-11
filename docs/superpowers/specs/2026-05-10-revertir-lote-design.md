# Spec A: Revertir Lote — Design

## Goal
Gestión robusta del ciclo de vida de lotes de producción: recuperación automática ante crashes del wizard, y botón manual para revertir lotes completados con recálculo completo de inventario.

## Scope
- Feature 1: Crash recovery momento1 (wizard inyección interrumpido)
- Feature 2: Crash recovery momento2 (wizard post-pesaje interrumpido)
- Feature 3: Botón "Revertir lote" manual en historial (solo lotes completados)

No incluye edición de mermas ni edición de lotes completados (Spec B).

---

## Architecture

### Núcleo: `src/utils/revertirLote.js`

Función utilitaria centralizada usada por Feature 2 y Feature 3.

```
revertirLote(loteId, supabase, currentUser)

SOLO para el botón manual — usa flag 'revirtiendo':
  1. UPDATE lotes_maduracion SET estado='revirtiendo' WHERE lote_id=loteId
  2. Buscar produccion_inyeccion via lotes_maduracion.produccion_id
  3. Buscar materia_prima_id de la carne via produccion_inyeccion_cortes
  4. Revertir movimiento de carne:
     - inventario_movimientos WHERE materia_prima_id=carneId AND motivo ILIKE '%loteId%' → salida→suma, entrada→resta
     - UPDATE inventario_mp SET stock_kg = stock_kg + kgCarne
  5. Revertir movimientos del wizard (salmuera, rub, adicional, mermas):
     - inventario_movimientos WHERE motivo ILIKE '%Lote {loteId}%'
     - Para cada movimiento: revertir en inventario_mp
  6. DELETE inventario_movimientos WHERE motivo ILIKE '%Lote {loteId}%'
  7. DELETE inventario_movimientos WHERE materia_prima_id=carneId AND fecha=lote.fecha_entrada (movimiento carne)
  8. DELETE stock_lotes_inyectados WHERE lote_id=loteId
  9. DELETE lotes_maduracion WHERE lote_id=loteId
  10. DELETE produccion_inyeccion_cortes WHERE produccion_id=produccionId
  11. DELETE produccion_inyeccion WHERE id=produccionId
  12. INSERT auditoria: tipo='lote_revertido', usuario, producto, kg revertidos, mensaje
```

**Flag 'revirtiendo':** Solo aplica al botón manual. Si la app detecta un lote con `estado='revirtiendo'` al montar TabMaduracion, llama `revertirLote()` automáticamente para terminar el trabajo incompleto.

---

## Feature 1: Crash Recovery Momento1

**Detecta en:** `useEffect` al montar TabMaduracion (dentro de `cargar()`).

**Condición:**
```
lotes_maduracion WHERE:
  estado = 'activo'
  AND bloques_resultado IS NULL
  AND el producto tiene bloques configurados (verificar via horneadoCfgs)
```

**Acción:**
- Llama `revertirLote()` completo (sin flag, ya que el lote nunca llegó a 'completado')
- Carne vuelve al inventario
- Todos los registros eliminados
- Toast: "⚠️ Se limpió 1 lote incompleto"
- El operario debe empezar desde cero

**Nota:** Lotes sin bloques configurados con `bloques_resultado=null` son válidos — NO revertir.

---

## Feature 2: Crash Recovery Momento2

**Detecta en:** `useEffect` al montar TabMaduracion (dentro de `cargar()`).

**Condición:**
```
lotes_maduracion WHERE:
  estado = 'completado'
  AND NOT EXISTS (SELECT 1 FROM stock_lotes_inyectados WHERE lote_id = lotes_maduracion.lote_id)
```

**Acción (revert parcial — solo momento2):**
1. Buscar movimientos de momento2 del lote:
   `inventario_movimientos WHERE motivo ILIKE '%Lote {loteId}%' AND tipo IN ('salida','entrada')`
   Filtrar solo los de rub/adicional/mermas (no carne ni salmuera de momento1)
2. Revertir esos movimientos en `inventario_mp`
3. Eliminar esos movimientos de `inventario_movimientos`
4. Limpiar pasos momento2 de `bloques_resultado` (mantener solo pasos momento1):
   `UPDATE lotes_maduracion SET bloques_resultado = {momento1: true, pasos: [pasos_m1]}`
5. `UPDATE lotes_maduracion SET estado='activo'`
6. Toast: "⚠️ 1 lote retomado — continúa el registro de pesaje"

**Resultado:** El lote reaparece como "LISTO PARA PESAJE" en la pestaña Maduración.

---

## Feature 3: Botón "Revertir lote" manual

**Ubicación:** Tab Historial en TabMaduracion, en cada lote completado.

**Visibilidad por rol:**
```
Operario de producción:
  - Visible si: ahora - lote.fecha_completado < 24 horas
  - Oculto después de 24h

Admin:
  - Siempre visible, sin límite de tiempo
```

**Cómo detectar fecha completado:** `lotes_maduracion.updated_at` (timestamp de cuando se marcó 'completado').

**Flujo:**
```
1. Operario/Admin presiona "🔄 Revertir"

2. Modal confirmación:
   "¿Revertir Lote 10/05/26?
    Se devolverán X kg al inventario.
    El lote desaparecerá del historial.
    Esta acción no se puede deshacer."
   [Cancelar]  [Confirmar revertir]

3. Al confirmar → llama revertirLote(loteId)
   - Con flag: UPDATE estado='revirtiendo' primero
   - Ejecuta todos los pasos del núcleo

4. Al completar:
   - Lote desaparece del historial de producción
   - Registro en Auditoría:
     tipo: 'lote_revertido'
     producto: nombre del producto
     mensaje: "Lote {loteId} revertido por {usuario}"
     campo ANTES: "{X} kg completados el {fecha}"
     campo DESPUÉS: "revertido"
   - Toast: "✅ Lote revertido correctamente"
```

**Detección del flag al recargar:**
```
Al montar TabMaduracion, además de los casos 1 y 2, revisar:
  lotes_maduracion WHERE estado='revirtiendo'
  → llamar revertirLote() para completar el revert interrumpido
```

---

## Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `src/utils/revertirLote.js` | NUEVO — función núcleo |
| `src/components/produccion/TabMaduracion.js` | crash detection en cargar() + botón revertir en historial |

---

## Auditoría

El registro en auditoría usa la tabla/función existente `crearNotificacion` con:
```javascript
{
  tipo: 'lote_revertido',
  producto_nombre: nombreProducto,
  campo: 'lote',
  antes: `${kgTotal} kg — Lote ${loteId}`,
  despues: 'revertido',
  mensaje: `Lote ${loteId} revertido por ${usuario}`,
  usuario_nombre: currentUser.email,
}
```

---

## Permisos

```
currentUser.rol === 'admin'       → puede revertir siempre
currentUser.rol === 'produccion'  → puede revertir si < 24h desde completado
otros roles                       → no ven el botón
```
