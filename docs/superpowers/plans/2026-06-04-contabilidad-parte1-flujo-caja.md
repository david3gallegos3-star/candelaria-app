# Contabilidad Parte 1 — Corrección Flujo de Caja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el routing de cuentas contables en todos los módulos: efectivo → Caja Chica (1.1.1.02), transferencia/cheque → Banco (1.1.1.03). Agregar asiento contable a cobros (actualmente no existe). Unificar Caja General con Caja Chica.

**Architecture:** Todos los cambios contables pasan por `src/utils/asientosContables.js`. Se agrega un helper `cuentaCashOrBank(formaPago, cuentas)` usado en todas las funciones. Se agrega `generarAsientoCobro()`. Se modifica `generarAsientoNomina()` para recibir `formaPago`. `TabCobrar.js` llama al nuevo asiento. `TabNomina.js` ya tiene el modal de pago (Parte 3), aquí se conecta el `formaPago` al asiento.

**Tech Stack:** React, Supabase (PostgREST), partida doble contable.

**IMPORTANTE:** Ejecutar DESPUÉS de Parte 3 (ya agrega `forma_pago` a `nomina`).

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/utils/asientosContables.js` | Helper + fix 6 funciones + nueva generarAsientoCobro |
| `src/components/facturacion/TabCobrar.js` | Llamar generarAsientoCobro tras cobro exitoso |
| `src/components/rrhh/TabNomina.js` | Pasar formaPago a generarAsientoNomina en confirmarPago |

---

## Task 1: asientosContables.js — helper y corrección de todas las funciones

**Archivo:** `src/utils/asientosContables.js`

Contexto: este archivo tiene 7 funciones exportadas. El problema central es que todas usan `cuentas.caja_general_id` para efectivo en lugar de `cuentas.caja_chica_id`, y algunas usan `cuentas.banco_id` para efectivo (error más grave).

- [ ] **Paso 1: Agregar helper `cuentaCashOrBank` al inicio del archivo**

Justo después de la función `validarPartidaDoble` (línea ~20), agregar:

```javascript
function cuentaCashOrBank(formaPago, cuentas) {
  if (!formaPago || formaPago === 'efectivo') return cuentas.caja_chica_id;
  if (formaPago === 'credito')               return cuentas.cxc_id;
  return cuentas.banco_id; // transferencia, cheque, deposito
}
```

- [ ] **Paso 2: Corregir `generarAsientoFactura` — línea 50**

Reemplazar:
```javascript
const cuentaDebe = factura.metodo_pago === 'credito' ? cuentas.cxc_id : cuentas.caja_general_id;
```

Por:
```javascript
const cuentaDebe = cuentaCashOrBank(factura.metodo_pago, cuentas);
```

- [ ] **Paso 3: Corregir `generarAsientoCompra` — línea 84**

Reemplazar:
```javascript
const cuentaHaber = compra.forma_pago === 'credito' ? cuentas.cxp_id : cuentas.banco_id;
```

Por:
```javascript
const cuentaHaber = compra.forma_pago === 'credito'
  ? cuentas.cxp_id
  : compra.forma_pago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;
```

- [ ] **Paso 4: Corregir `generarAsientoNomina` — agregar parámetro `formaPago`**

Reemplazar la firma y la línea del banco:
```javascript
// ANTES:
export async function generarAsientoNomina(nomina) {
  // ...
  { cuenta_id: cuentas.banco_id, descripcion: descA, debe: 0, haber: nomina.total_pagar, orden: 1 },

// DESPUÉS:
export async function generarAsientoNomina(nomina, formaPago = 'transferencia') {
  // ...
  { cuenta_id: formaPago === 'efectivo' ? cuentas.caja_chica_id : cuentas.banco_id,
    descripcion: descA, debe: 0, haber: nomina.total_pagar, orden: 1 },
```

- [ ] **Paso 5: Corregir `generarAsientoCierre` — línea 164**

El cierre de Caja Chica usa `caja_general_id` como contrapartida. Ahora que Caja General = Caja Chica, el asiento de cierre de ingresos queda:

Reemplazar (línea 163-165):
```javascript
if (cierre.total_ingresos > 0) {
  lineas.push({ cuenta_id: caja_chica_id, descripcion: descripcionCab, debe: cierre.total_ingresos, haber: 0, orden: 0 });
  lineas.push({ cuenta_id: cuentas.caja_general_id, descripcion: descripcionCab, debe: 0, haber: cierre.total_ingresos, orden: 1 });
}
```

Por (los ingresos de caja chica van directamente a la misma cuenta — el ingreso ya está en caja_chica_id, el haber es la cuenta de ventas internas):
```javascript
if (cierre.total_ingresos > 0) {
  lineas.push({ cuenta_id: cuentas.caja_chica_id, descripcion: descripcionCab, debe: cierre.total_ingresos, haber: 0, orden: 0 });
  lineas.push({ cuenta_id: cuentas.ventas_internas_id, descripcion: descripcionCab, debe: 0, haber: cierre.total_ingresos, orden: 1 });
}
```

Nota: el parámetro `caja_chica_id` que recibe la función es el ID de la cuenta específica del cierre (puede ser diferente por sucursal). Reemplazar el uso de ese parámetro por `cuentas.caja_chica_id` para consistencia, O mantener el parámetro `caja_chica_id` como está (ya es correcto en los gastos).

- [ ] **Paso 6: Corregir `generarAsientoInicial` — línea 193**

Reemplazar:
```javascript
{ cuenta_id: cuentas.caja_general_id, descripcion: descripcionCab, debe: config.caja, haber: 0, orden: 1 },
```

Por:
```javascript
{ cuenta_id: cuentas.caja_chica_id, descripcion: descripcionCab, debe: config.caja, haber: 0, orden: 1 },
```

- [ ] **Paso 7: Corregir `revertirAsientoFactura` — línea 287**

Reemplazar:
```javascript
const cuentaHaber = factura.forma_pago === 'credito'
  ? cuentas.cxc_id
  : cuentas.caja_general_id;
```

Por:
```javascript
const cuentaHaber = cuentaCashOrBank(factura.forma_pago, cuentas);
```

- [ ] **Paso 8: Corregir `revertirAsientoNotaVenta` — línea 312**

Reemplazar:
```javascript
const cuentaDebe = factura.metodo_pago === 'credito'
  ? cuentas.cxc_id
  : cuentas.caja_general_id;
```

Por:
```javascript
const cuentaDebe = cuentaCashOrBank(factura.metodo_pago, cuentas);
```

- [ ] **Paso 9: Agregar nueva función `generarAsientoCobro`**

Agregar antes de `sincronizarAsientos`:

```javascript
export async function generarAsientoCobro(cobro) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe = cobro.forma_pago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;

  const descripcion = `Cobro CxC - ${cobro.forma_pago || 'efectivo'}`;
  const lineas = [
    { cuenta_id: cuentaDebe,      descripcion, debe: cobro.monto, haber: 0,           orden: 0 },
    { cuenta_id: cuentas.cxc_id,  descripcion, debe: 0,           haber: cobro.monto, orden: 1 },
  ];

  return insertarAsiento({
    fecha:       cobro.fecha,
    descripcion,
    tipo:        'interno',
    origen:      'cobros',
    origen_id:   cobro.id,
    lineas,
  });
}
```

- [ ] **Paso 10: Commit**

```bash
git add src/utils/asientosContables.js
git commit -m "fix(contabilidad): routing efectivo→CajaChica, banco→Banco, agregar generarAsientoCobro"
```

---

## Task 2: TabCobrar.js — llamar asiento al registrar cobro

**Archivo:** `src/components/facturacion/TabCobrar.js`

Contexto: el cobro se inserta en la tabla `cobros` (~línea 108-120) pero actualmente no crea ningún asiento contable. Necesitamos llamar `generarAsientoCobro` después del insert exitoso.

- [ ] **Paso 1: Importar `generarAsientoCobro`**

Al inicio del archivo, agregar la importación:

```javascript
import { generarAsientoCobro } from '../../utils/asientosContables';
```

- [ ] **Paso 2: Llamar `generarAsientoCobro` tras el insert exitoso**

Buscar el insert en `cobros` (cerca de línea 108-120). Después del insert exitoso, agregar la llamada al asiento. El bloque actual luce así:

```javascript
const { data: cobroData, error: errCobro } = await supabase.from('cobros').insert({
  cuenta_cobrar_id: cuenta.id,
  factura_id:       cuenta.factura_id,
  cliente_id:       cuenta.cliente_id,
  monto,
  forma_pago:       formaCobro,
  fecha:            today,
  observaciones,
  registrado_por,
  referencia_pago:  ...,  // ya agregado en Parte 3
}).select().single();
```

Agregar después del insert (en el bloque donde no hay error):

```javascript
if (!errCobro && cobroData) {
  generarAsientoCobro({
    id:         cobroData.id,
    monto:      parseFloat(monto),
    forma_pago: formaCobro,
    fecha:      today,
  }).catch(e => console.error('Error asiento cobro:', e));
}
```

Si el insert actual no hace `.select().single()`, modificarlo para obtener el `id` del cobro insertado:
```javascript
const { data: cobroData, error: errCobro } = await supabase
  .from('cobros').insert({ ... }).select('id, monto, forma_pago, fecha').single();
```

- [ ] **Paso 3: Commit**

```bash
git add src/components/facturacion/TabCobrar.js
git commit -m "feat(cobros): crear asiento contable automático al registrar cobro de CxC"
```

---

## Task 3: TabNomina.js — conectar formaPago al asiento

**Archivo:** `src/components/rrhh/TabNomina.js`

Contexto: La Parte 3 ya modificó `confirmarPago()` para capturar `formaPago`. Ahora se necesita verificar que la llamada a `generarAsientoNomina` recibe ese `formaPago`.

- [ ] **Paso 1: Verificar la llamada en `confirmarPago`**

La función `confirmarPago` (agregada en Parte 3) debe verse así:

```javascript
async function confirmarPago() {
  if (!modalPago) return;
  const { id, formaPago, referencia } = modalPago;
  await supabase.from('nomina').update({
    estado: 'pagado',
    fecha_pago: now.toISOString().slice(0, 10),
    forma_pago: formaPago,
    referencia_pago: ['transferencia', 'cheque', 'deposito'].includes(formaPago) ? referencia || null : null,
  }).eq('id', id);
  const row = nomina.find(n => n.id === id);
  if (row) {
    generarAsientoNomina({
      id: row.id,
      periodo: row.periodo,
      total_sueldos: row.sueldo_prop || 0,
      total_iess_patronal: row.iess_patronal || 0,
      total_pagar: row.sueldo_neto || 0,
    }, formaPago).catch(console.error);  // ← formaPago como segundo parámetro
  }
  setModalPago(null);
  await cargar();
}
```

Verificar que `formaPago` se pasa como segundo argumento a `generarAsientoNomina`. Si Parte 3 ya lo hizo correctamente, este task es solo de verificación.

- [ ] **Paso 2: Verificar import de generarAsientoNomina**

Confirmar que el import al inicio del archivo incluye `generarAsientoNomina`:

```javascript
import { generarAsientoNomina } from '../../utils/asientosContables';
```

- [ ] **Paso 3: Commit y push**

```bash
git add src/components/rrhh/TabNomina.js
git commit -m "fix(nomina): pasar forma_pago al asiento contable de nómina"
git push origin main
```
