---
name: contabilidad-auditoria
description: Auditar que cualquier cambio contable esté correctamente conectado: tabla fuente → pestaña talonario → sección resumen (izquierda/derecha) → asiento libro diario (debe/haber). Usar cuando se modifique algo relacionado con contabilidad, o cuando se pida escanear toda la contabilidad.
---

# Auditoría Contable — Candelaria App

## Principio

Cada movimiento de dinero en la app sigue un flujo de 4 capas:

```
MÓDULO (tabla DB) → TALONARIO (pestaña) → RESUMEN (lado izq/der) → LIBRO DIARIO (debe/haber)
```

Este agente verifica que las 4 capas estén conectadas. Si algo está desconectado, roto, o no cuadra, lo reporta.

---

## Regla fundamental del Resumen

- **LADO IZQUIERDO (MES)** = base devengado: lo que se generó ESE mes, aunque no se haya pagado aún
- **LADO DERECHO (CONSOLIDADO)** = base caja: solo lo que se pagó/cobró efectivamente ESE mes

---

## Mapa completo de flujos

### INGRESOS

| Módulo / tabla | forma_pago | Pestaña Talonario | Resumen IZQUIERDO (MES) | Resumen DERECHO (CONSOLIDADO) | Libro Diario |
|---|---|---|---|---|---|
| `facturas` | efectivo | Cobros Efectivo | ✅ Ingreso ventas | ✅ Cobros efectivo | DEBE Caja Chica / HABER Ventas + IVA |
| `facturas` | transferencia / cheque / tarjeta_credito | Cobros Transferencia | ✅ Ingreso ventas | ✅ Cobros transf/depósito | DEBE Banco / HABER Ventas + IVA |
| `facturas` | credito / credito_nomina | — (pasa a CxC) | ✅ Ingreso ventas | ❌ No (aún no cobrado) | DEBE CxC Clientes / HABER Ventas + IVA |
| `cobros` | efectivo | Cobros Efectivo | ❌ Ya estaba en MES | ✅ Cobros efectivo | DEBE Caja Chica / HABER CxC Clientes |
| `cobros` | transferencia / deposito / cheque / tarjeta_credito | Cobros Transferencia | ❌ Ya estaba en MES | ✅ Cobros transf/depósito | DEBE Banco / HABER CxC Clientes |
| `talonario_otros_ingresos` | cualquiera menos 01 | Otros Ingresos | ✅ Otros ingresos | ✅ Otros ingresos | Sin asiento automático |

### EGRESOS — COMPRAS

| Módulo / tabla | forma_pago / condición | Pestaña Talonario | Resumen IZQUIERDO (MES) | Resumen DERECHO (CONSOLIDADO) | Libro Diario |
|---|---|---|---|---|---|
| `compras` (es_personal=false) | efectivo | Compras | ✅ Compras efectivo | ✅ Gasto efectivo | DEBE Inventario MP + IVA / HABER Caja Chica |
| `compras` (es_personal=false) | transferencia / cheque / deposito | Compras | ✅ Compras banco | ✅ Salida banco | DEBE Inventario MP + IVA / HABER Banco |
| `compras` (es_personal=false) | credito | Compras | ✅ Compras (con factura o sin) | ❌ No (aún no pagado) | DEBE Inventario MP + IVA / HABER CxP Proveedores |
| `pagos_compras` (es_personal=false) | transferencia / cheque / deposito | Pagos Del Mes (automático) | ❌ Ya estaba en MES | ✅ Salida banco | DEBE CxP / HABER Banco (+comisión si aplica) |
| `compras` (es_personal=true) | cualquiera | Facturas Personales | ✅ Compras personales | ✅ si no es crédito | DEBE Inventario / HABER según forma |
| `pagos_compras` (es_personal=true) | cualquiera | — (excluido de Pagos Del Mes) | ❌ | ❌ | DEBE CxP / HABER Banco |

### EGRESOS — GASTOS CAJA CHICA

| Módulo / tabla | condición | Pestaña Talonario | Resumen IZQUIERDO | Resumen DERECHO | Libro Diario |
|---|---|---|---|---|---|
| `caja_gastos` (es_personal=false) | cualquiera | Gastos Efectivo | ✅ Gastos efectivo | ✅ Gastos efectivo | Asiento en cierre caja: DEBE Gastos / HABER Caja Chica |
| `caja_gastos` (es_personal=true) | cualquiera | Pagos Personales | ✅ Gastos personales | ✅ Gastos personales | Asiento en cierre caja |
| `caja_entregas` | depósito banco | BANCO (entrada) | — | ✅ Entrada banco | DEBE Banco / HABER Caja Chica |

### EGRESOS — NÓMINA / IESS / BANCO

| Módulo / tabla | Pestaña Talonario | Resumen IZQUIERDO | Resumen DERECHO | Libro Diario |
|---|---|---|---|---|
| `nomina` | — (resumen directo) | ✅ Sueldos MES | ✅ Sueldos CONSOLIDADO | DEBE Sueldos / HABER Banco + Descuentos |
| `nomina` (IESS patronal) | — (resumen directo) | ✅ IESS MES | ✅ IESS CONSOLIDADO | DEBE IESS Patronal / HABER IESS por Pagar |
| `talonario_pagos_banco` | Pagos Del Mes (manual) | ❌ | ✅ Pagos banco | Sin asiento automático |
| `talonario_facturas_personales` forma_pago=20 | — (banco) | ✅ Gastos personales | ✅ Gastos personales | Sin asiento automático |

### PAGOS PERSONALES

| Módulo / tabla | Pestaña Talonario | Resumen IZQUIERDO | Resumen DERECHO |
|---|---|---|---|
| `talonario_prestamos_tarjetas` | Otros Pagos Personales | ✅ Préstamo/tarjeta | ✅ Préstamo/tarjeta |
| `caja_gastos` (es_personal=true) | Pagos Personales | ✅ Gastos personales | ✅ Gastos personales |
| `compras` (es_personal=true) | Facturas Personales | ✅ Compras personales | ✅ si no crédito |

---

## Archivos clave por capa

### Capa 1 — Tablas DB (fuente de datos)
- `facturas`, `cobros` — ventas y cobros
- `compras`, `pagos_compras`, `cuentas_pagar` — compras y pagos a proveedores
- `caja_chica`, `caja_gastos`, `caja_entregas` — caja chica
- `nomina`, `nomina_empleados` — sueldos
- `talonario_pagos_banco` — pagos manuales banco
- `talonario_otros_ingresos` — otros ingresos
- `talonario_facturas_personales` — facturas personales banco
- `talonario_prestamos_tarjetas` — préstamos y tarjetas personales

### Capa 2 — Pestañas Talonario
- `src/components/contabilidad/talonario/ingresos/CobrosEfectivo.js` → `cobros` efectivo + `facturas` efectivo
- `src/components/contabilidad/talonario/ingresos/CobrosTransferencia.js` → `cobros` transf/depósito/tarjeta
- `src/components/contabilidad/talonario/ingresos/CobrosCheques.js` → `cobros` cheque
- `src/components/contabilidad/talonario/ingresos/OtrosIngresos.js` → `talonario_otros_ingresos`
- `src/components/contabilidad/talonario/egresos/GastosEfectivo.js` → `caja_gastos` !es_personal
- `src/components/contabilidad/talonario/egresos/PagosDelMes.js` → `talonario_pagos_banco` (manual) + `pagos_compras` !es_personal banco
- `src/components/contabilidad/talonario/egresos/PagosPersonales.js` → `caja_gastos` es_personal
- `src/components/contabilidad/talonario/compras/ComprasTalonario.js` → `compras` !es_personal
- `src/components/contabilidad/talonario/compras/FacturasPersonales.js` → `compras` es_personal
- `src/components/contabilidad/talonario/banco/MovimientosBanco.js` → múltiples tablas, vista banco

### Capa 3 — Resumen Talonario
- `src/components/contabilidad/talonario/ResumenTalonario.js`
- `src/utils/saldoBanco.js` — saldo calculado banco

### Capa 4 — Libro Diario
- `src/utils/asientosContables.js` — todas las funciones de asientos
  - `generarAsientoFactura()` — ventas
  - `generarAsientoCompra()` — compras
  - `generarAsientoPagoProveedor()` — pagos a proveedores con comisión
  - `generarAsientoCobro()` — cobros de CxC
  - `generarAsientoNomina()` — sueldos e IESS
  - `generarAsientoCierre()` — cierre caja chica
  - `generarAsientoInicial()` — saldos apertura

---

## Protocolo de auditoría

### Al modificar algo contable, verificar:

1. **¿Qué tabla DB escribe?** → identifica la fuente
2. **¿Qué pestaña del talonario lee esa tabla?** → verifica el SELECT y los filtros
3. **¿Esa pestaña existe en el mapa de flujos?** → confirma que está mapeada
4. **¿El ResumenTalonario agrega ese dato?** → lado izquierdo si es devengado, derecho si es pagado/cobrado
5. **¿saldoBanco.js lo incluye o excluye correctamente?** → solo entradas/salidas bancarias reales
6. **¿Se genera asiento libro diario?** → DEBE = HABER, cuentas correctas, número de factura incluido

### Al pedir escaneo completo (`escanea todo`):

1. Leer `ResumenTalonario.js` completo — mapear cada variable a su tabla fuente
2. Leer `saldoBanco.js` — mapear cada query a su tabla fuente
3. Leer cada componente de talonario — verificar SELECT y filtros
4. Leer `asientosContables.js` — verificar que cada función cuadra
5. Reportar en formato tabla: transacción → pestaña → resumen izq/der → asiento

### Formato de reporte:

```
FLUJO: [nombre del movimiento]
  DB:           [tabla] → filtros: [condiciones]
  Talonario:    [componente.js] pestaña "[nombre]"
  Resumen MES:  [variable] en [sección] — [descripción]
  Resumen CONS: [variable] en [sección] — [descripción]  (o "❌ No aplica")
  Libro Diario: DEBE [cuenta] $X / HABER [cuenta] $X
  Estado:       ✅ Conectado | ⚠️ Parcial | ❌ Desconectado
  Problema:     [descripción si hay algo roto]
```

---

## Alertas automáticas

Reportar inmediatamente si se detecta:
- Un INSERT a una tabla de transacciones sin `generarAsiento*()` siendo llamado
- Un filtro en ResumenTalonario que excluye algo que debería incluir (o viceversa)
- Un asiento donde DEBE ≠ HABER
- Una tabla leída en talonario con forma_pago diferente a lo que escribe el módulo
- `pagos_compras` de compra personal (es_personal=true) apareciendo en Pagos Del Mes
- Comisión en cobros (no debe existir — la comisión va en pagos_compras)
- `saldoBanco.js` incluyendo efectivo en entradas/salidas banco
