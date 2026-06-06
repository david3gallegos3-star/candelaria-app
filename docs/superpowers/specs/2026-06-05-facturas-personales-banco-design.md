# Facturas Personales en Banco — Design Spec

**Fecha:** 2026-06-05
**Estado:** Aprobado

## Problema

Los pagos personales registrados en Compras > Facturas Personales por transferencia/depósito/cheque no aparecen en la pestaña BANCO, por lo que el saldo calculado no refleja esas salidas. Además no hay forma de evitar registrar el mismo pago dos veces.

## Solución

Campo `numero_transferencia` en `talonario_facturas_personales` + validación de duplicados en frontend + query adicional en MovimientosBanco que incluye esas salidas.

---

## 1. Base de datos

```sql
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS numero_transferencia TEXT;
```

- Nullable en DB (las entradas con `forma_pago != '20'` no lo usan)
- Obligatorio en UI cuando `forma_pago = '20'`

---

## 2. FacturasPersonales.js

### 2a. Campo en formulario

Cuando `forma_pago = '20'`, mostrar campo adicional antes de Comentario:

```
Nº Transferencia / Depósito *
[________________________]
```

- Requerido visualmente (asterisco, borde rojo si vacío al intentar guardar)
- Se incluye en el estado `form` como `numero_transferencia`
- Se incluye en el objeto `VACIO` como `numero_transferencia: ''`

### 2b. Validaciones al guardar

Antes del INSERT/UPDATE, en orden:

1. Si `forma_pago = '20'` y `numero_transferencia` está vacío → `alert('El número de transferencia es obligatorio para pagos bancarios')` y retornar
2. Si `forma_pago = '20'` → query a Supabase:
   ```js
   supabase.from('talonario_facturas_personales')
     .select('id')
     .eq('numero_transferencia', form.numero_transferencia)
     .neq('id', form.id || '')  // excluir la fila actual si es edición
     .maybeSingle()
   ```
   Si retorna fila → `alert('Este número de transferencia ya está registrado')` y retornar

3. Si pasa ambas → guardar normalmente con `numero_transferencia` en el payload

### 2c. Tabla

Agregar columna `Nº Transf.` entre Descripción y Monto:

```js
{ key: 'numero_transferencia', label: 'Nº Transf.', render: f => f.numero_transferencia || '—' },
```

---

## 3. MovimientosBanco.js

### 3a. Query adicional

Agregar 5° query en el `Promise.all` de `cargar()`:

```js
supabase.from('talonario_facturas_personales')
  .select('id,fecha,proveedor,descripcion,monto,numero_transferencia')
  .eq('mes', mes).eq('año', año)
  .eq('forma_pago', '20')
  .order('fecha'),
```

### 3b. Filas en lista de movimientos

Agregar después del bloque de `pagosB`:

```js
...(factsP||[]).map(f => ({
  fecha: f.fecha || '',
  descripcion: `Factura personal — ${f.proveedor || f.descripcion || ''}${f.numero_transferencia ? ` (${f.numero_transferencia})` : ''}`,
  tipo: 'salida',
  monto: parseFloat(f.monto||0),
})),
```

### 3c. Efecto en KPIs

Las facturas personales bancarias se suman automáticamente a `totalSalidas` y restan del neto del mes.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL editor (manual) | `ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS numero_transferencia TEXT` |
| `src/components/contabilidad/talonario/compras/FacturasPersonales.js` | Campo en form, validaciones, columna en tabla |
| `src/components/contabilidad/talonario/banco/MovimientosBanco.js` | 5° query + filas de salida |

---

## Fuera de alcance

- Validación cruzada contra otras tablas (cobros, pagos banco) — decidido en diseño
- Compras con `es_personal=true` del módulo Compras — ya aparecen en FacturasPersonales como readonly, si tienen `forma_pago='20'` no se duplican porque vienen de otra tabla y no tienen `numero_transferencia`
- Edición del `numero_transferencia` en filas provenientes del módulo Compras (son `_readOnly`)
