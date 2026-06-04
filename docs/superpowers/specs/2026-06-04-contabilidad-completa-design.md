# Diseño: Contabilidad Completa — Flujo de Caja, Reportes y Referencias de Pago

**Fecha:** 2026-06-04  
**Estado:** Aprobado

---

## Resumen

Tres partes independientes que completan el sistema contable formal de Candelaria:

1. **Parte 1** — Corrección del flujo de caja en todos los módulos
2. **Parte 2** — Módulo "Reportes Contables" (Estado de Resultados, Balance General, Libro Mayor, Balance de Comprobación)
3. **Parte 3** — Número de referencia/depósito en pagos por transferencia o depósito

---

## Regla fundamental de caja

```
EFECTIVO   → siempre cuenta Caja Chica (1.1.1.02)
BANCO      → siempre cuenta Banco (1.1.1.03) — transferencia, depósito, cheque
CRÉDITO    → CxC (1.1.2.01) para ventas / CxP (2.1.1.01) para compras
CAJA GENERAL (1.1.1.01) → eliminada del flujo — se unifica a Caja Chica
```

---

## Parte 1 — Corrección del flujo de caja

### 1.1 Problema actual

| Módulo | Error actual | Corrección |
|---|---|---|
| Ventas (efectivo) | → Caja General (1.1.1.01) | → Caja Chica (1.1.1.02) |
| Ventas (transferencia/cheque) | → Caja General (1.1.1.01) | → Banco (1.1.1.03) |
| Compras (efectivo) | → Banco (1.1.1.03) ❌ error grave | → Caja Chica (1.1.1.02) |
| Compras (transferencia/cheque) | → Banco (1.1.1.03) | ✅ correcto |
| Cobros | No crea asiento contable ❌ | Crear `generarAsientoCobro()` |
| Nómina | Siempre → Banco, sin selección | Agregar forma de pago |

### 1.2 Cambios en `src/utils/asientosContables.js`

#### `generarAsientoFactura()` — corrección de routing

```javascript
// ANTES (línea 50):
const cuentaDebe = factura.metodo_pago === 'credito'
  ? cuentas.cxc_id
  : cuentas.caja_general_id; // ← INCORRECTO

// DESPUÉS:
function cuentaEfectivoBanco(formaPago, cuentas) {
  if (formaPago === 'credito') return cuentas.cxc_id;
  if (formaPago === 'efectivo') return cuentas.caja_chica_id;
  return cuentas.banco_id; // transferencia, deposito, cheque
}
const cuentaDebe = cuentaEfectivoBanco(factura.metodo_pago, cuentas);
```

#### `generarAsientoCompra()` — corrección de routing

```javascript
// ANTES (línea 84):
const cuentaHaber = compra.forma_pago === 'credito'
  ? cuentas.cxp_id
  : cuentas.banco_id; // ← INCORRECTO para efectivo

// DESPUÉS:
const cuentaHaber = compra.forma_pago === 'credito'
  ? cuentas.cxp_id
  : compra.forma_pago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;
```

#### Nueva función `generarAsientoCobro()` — cobros de CxC

Cuando el cliente paga una cuenta por cobrar, se crea este asiento:

```javascript
export async function generarAsientoCobro(cobro) {
  // cobro: { id, factura_id, monto, forma_pago, fecha }
  const { cuentas } = await getCuentasModulos();

  const cuentaDebe = cobro.forma_pago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;

  const lineas = [
    { cuenta_id: cuentaDebe, descripcion: `Cobro factura`, debe: cobro.monto, haber: 0, orden: 0 },
    { cuenta_id: cuentas.cxc_id, descripcion: `Cobro factura`, debe: 0, haber: cobro.monto, orden: 1 },
  ];

  return insertarAsiento({
    fecha: cobro.fecha,
    descripcion: `Cobro CxC - ${cobro.forma_pago}`,
    tipo: 'interno',
    origen: 'cobros',
    origen_id: cobro.id,
    lineas,
  });
}
```

#### Modificar `generarAsientoNomina()` — forma de pago

```javascript
// ANTES: siempre usa banco_id
// DESPUÉS: usa forma_pago del parámetro
export async function generarAsientoNomina(nomina, formaPago = 'transferencia') {
  const cuentaHaber = formaPago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;

  // Asiento 1: gasto sueldo
  lineas = [
    { cuenta_id: cuentas.sueldos_id, debe: nomina.sueldo_neto, haber: 0 },
    { cuenta_id: cuentaHaber, debe: 0, haber: nomina.sueldo_neto },
  ];
  // Asiento 2: IESS patronal (sin cambio — siempre a cuenta IESS por pagar)
}
```

### 1.3 Cambios en TabNomina.js — selector de forma de pago

Al hacer clic en "Generar nómina", antes de confirmar aparece un modal con:

```
¿Cómo se pagará la nómina de [Empleado]?

○ Transferencia / Cheque   (→ Banco)
○ Efectivo                 (→ Caja Chica)

[Cancelar]  [Confirmar pago]
```

La forma de pago se pasa a `generarAsientoNomina(nomina, formaPago)` y se guarda en la tabla `nomina` como campo `forma_pago`.

Migración SQL necesaria:
```sql
ALTER TABLE nomina ADD COLUMN IF NOT EXISTS forma_pago text DEFAULT 'transferencia';
```

### 1.4 Cambios en TabCobrar.js — asiento al cobrar

Después del insert en `cobros`, invocar `generarAsientoCobro(cobro)`:

```javascript
const { data: cobroInserted } = await supabase.from('cobros').insert({...}).select().single();
if (cobroInserted) {
  await generarAsientoCobro({
    id: cobroInserted.id,
    monto: cobroInserted.monto,
    forma_pago: cobroInserted.forma_pago,
    fecha: cobroInserted.fecha,
  });
}
```

### 1.5 Eliminar Caja General del flujo

En `getCuentasModulos()` o en cada función: donde se use `cuentas.caja_general_id`, reemplazar por `cuentas.caja_chica_id`. La cuenta 1.1.1.01 permanece en el plan de cuentas (para asiento inicial histórico) pero ya no recibe nuevos movimientos.

---

## Parte 2 — Módulo "Reportes Contables"

### 2.1 Ubicación en la app

Nuevo módulo accesible desde el menú principal, separado del Talonario y del Libro Diario.

Ruta: acceso desde `MenuPrincipal` como "📊 Reportes Contables"

### 2.2 Reportes incluidos

| Reporte | Descripción | Fuente |
|---|---|---|
| Estado de Resultados | Ingresos − Gastos = Utilidad | `libro_diario_detalle` × `cuentas_contables` tipo ingreso/gasto |
| Balance General | Activos = Pasivos + Patrimonio | `libro_diario_detalle` × `cuentas_contables` tipo activo/pasivo/patrimonio |
| Libro Mayor | Movimientos y saldo acumulado por cuenta | `libro_diario_detalle` × `libro_diario` (con fecha) |
| Balance de Comprobación | Totales Debe/Haber por cuenta | `libro_diario_detalle` agrupado por `cuenta_id` |

### 2.3 Filtro de período

Dos modos en la parte superior del módulo:

```
[Mes rápido: dropdown mes/año]   |   [Rango: desde _____ hasta _____]
```

Ambos calculan `fechaDesde` y `fechaHasta` para filtrar `libro_diario.fecha`.

### 2.4 Estructura de componentes

```
src/components/contabilidad/reportes/
├── TabReportes.js              — contenedor principal con selector de reporte y período
├── EstadoResultados.js         — reporte de ingresos y gastos
├── BalanceGeneral.js           — reporte de activos/pasivos/patrimonio
├── LibroMayor.js               — movimientos por cuenta con saldo acumulado
├── BalanceComprobacion.js      — totales debe/haber por cuenta
└── utils/
    ├── reporteQueries.js       — funciones Supabase para cada reporte
    └── exportarPDF.js          — lógica de exportación PDF (window.print con CSS)
    └── exportarExcel.js        — lógica de exportación Excel (usando xlsx library)
```

### 2.5 Estado de Resultados

**Lógica de cálculo:**
```javascript
// Ingresos: cuentas tipo 'ingreso' → suma haber - debe
// Gastos:   cuentas tipo 'gasto'   → suma debe - haber
// Utilidad: total_ingresos - total_gastos
```

**Estructura visual:**
```
ESTADO DE RESULTADOS
Embutidos y Jamones Candelaria
Período: Enero 2026 – Junio 2026

INGRESOS
  Ventas gravadas (4.1.1.01)        $X,XXX.XX
  Ventas exentas (4.1.1.02)         $X,XXX.XX
  ─────────────────────────────────
  TOTAL INGRESOS                    $X,XXX.XX

GASTOS
  Sueldos y salarios (5.1.1.01)     $X,XXX.XX
  IESS patronal (5.1.1.02)          $X,XXX.XX
  Gastos caja chica (5.1.2.01)      $X,XXX.XX
  ─────────────────────────────────
  TOTAL GASTOS                      $X,XXX.XX

══════════════════════════════════
UTILIDAD / PÉRDIDA DEL PERÍODO     $X,XXX.XX
```

### 2.6 Balance General

**Lógica de cálculo:**
```javascript
// Activos:    cuentas tipo 'activo'     → saldo = debe - haber (naturaleza deudora)
// Pasivos:    cuentas tipo 'pasivo'     → saldo = haber - debe (naturaleza acreedora)
// Patrimonio: cuentas tipo 'patrimonio' → saldo = haber - debe (naturaleza acreedora)
// Validación: total_activos === total_pasivos + total_patrimonio
```

**Estructura visual:**
```
BALANCE GENERAL
Al 30 de Junio 2026

ACTIVOS                              PASIVOS
  Activo Corriente                     Pasivo Corriente
    Caja Chica           $X,XXX          CxP Proveedores    $X,XXX
    Banco                $X,XXX          IESS por Pagar     $X,XXX
    CxC Clientes         $X,XXX        ─────────────────────
  ─────────────────────              TOTAL PASIVOS          $X,XXX
  TOTAL ACTIVOS          $X,XXX
                                       PATRIMONIO
                                         Capital             $X,XXX
                                         Utilidad período    $X,XXX
                                       ─────────────────────
                                       TOTAL PATRIMONIO      $X,XXX

                                       PASIVOS + PATRIMONIO  $X,XXX
```

### 2.7 Libro Mayor

Por cada cuenta seleccionada (dropdown de `cuentas_contables`):

```
LIBRO MAYOR — Caja Chica (1.1.1.02)
Período: Enero – Junio 2026

Fecha       Descripción              Debe        Haber      Saldo
──────────────────────────────────────────────────────────────────
2026-01-15  Venta factura 001      $500.00               $500.00
2026-01-20  Gasto caja             $0.00       $80.00    $420.00
2026-02-01  Pago nómina Erika      $0.00      $432.45    -$12.45
...
                              ───────────   ─────────
TOTALES                          $X,XXX.XX  $X,XXX.XX  $X,XXX.XX
```

### 2.8 Balance de Comprobación

```
BALANCE DE COMPROBACIÓN
Período: Enero – Junio 2026

Código    Cuenta                     Debe Total    Haber Total    Saldo
──────────────────────────────────────────────────────────────────────────
1.1.1.02  Caja Chica                 $X,XXX.XX     $X,XXX.XX    $X,XXX.XX
1.1.1.03  Banco                      $X,XXX.XX     $X,XXX.XX    $X,XXX.XX
...
──────────────────────────────────────────────────────────────────────────
TOTALES                              $X,XXX.XX     $X,XXX.XX
```
*(Totales Debe = Totales Haber → partida doble cuadrada)*

### 2.9 Exportación

**PDF:** `window.print()` con CSS `@media print` — sin dependencias externas. Cada reporte tiene estilos de impresión que ocultan la UI y muestran solo el reporte formateado.

**Excel:** Librería `xlsx` (ya disponible como `npm:xlsx` o `@e965/xlsx`). Cada reporte genera una hoja con los mismos datos tabulares.

Botones en la UI:
```
[📄 Exportar PDF]   [📊 Exportar Excel]
```

---

## Parte 3 — Número de referencia en pagos por transferencia/depósito

### 3.1 Alcance

Cuando la forma de pago es `transferencia`, `deposito` o `cheque`, mostrar un campo opcional:

```
Número de transacción / depósito: [________________]
```

### 3.2 Módulos afectados

| Módulo | Tabla | Campo nuevo |
|---|---|---|
| Nueva Venta (facturas) | `facturas` | `referencia_pago` text nullable |
| Cobros (CxC) | `cobros` | `referencia_pago` text nullable |
| Compras | `compras` | `referencia_pago` text nullable |
| Nómina (pago) | `nomina` | `referencia_pago` text nullable |

### 3.3 Migración SQL

```sql
ALTER TABLE facturas  ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE cobros    ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE compras   ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE nomina    ADD COLUMN IF NOT EXISTS referencia_pago text;
```

### 3.4 Comportamiento UI

- El campo aparece SOLO cuando `forma_pago` es `transferencia`, `deposito` o `cheque`
- Es opcional (no bloquea si está vacío)
- Se muestra en las listas/tablas como columna adicional cuando tiene valor
- En el Libro Diario, se incluye en la `descripcion` del asiento: `"Pago transferencia #REF-123456"`

---

## Orden de implementación recomendado

1. **Parte 3** (SQL migrations + campo referencia) — más simple, sin dependencias
2. **Parte 1** (corrección flujo de caja) — corrige errores actuales, base para reportes correctos
3. **Parte 2** (módulo reportes) — necesita datos correctos de Parte 1 para ser preciso

---

## Lo que NO cambia

- La estructura de tablas `libro_diario` y `libro_diario_detalle` — ya son correctas
- El plan de cuentas `cuentas_contables` — ya tiene las 52 cuentas ecuatorianas
- El módulo Talonario — sigue como resumen operativo, paralelo a los reportes formales
- La cuenta Caja General (1.1.1.01) permanece en el plan de cuentas para el asiento inicial histórico, pero no recibe nuevos movimientos
