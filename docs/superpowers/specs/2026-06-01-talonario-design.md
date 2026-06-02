# Talonario — Diseño del módulo

**Fecha:** 2026-06-01  
**Módulo:** Contabilidad → Talonario  
**Estado:** Aprobado por David — listo para implementación

---

## 1. Propósito

Módulo que consolida todos los movimientos financieros mensuales de Embutidos y Jamones Candelaria en una sola vista, replicando la estructura del Excel que se usa actualmente. Permite ver el estado del mes en dos dimensiones: **MES** (devengo — lo que se generó) y **CONSOLIDADO** (caja — lo que realmente movió dinero).

Acceso: solo `admin` y `contador` pueden ingresar/editar datos manuales. Todos los roles pueden ver.

---

## 2. Arquitectura

**Patrón:** Context + componentes por sección (no monolítico).

```
src/components/contabilidad/talonario/
├── TalonarioContext.js          ← estado compartido: mes, año, esAdminContador
├── TabTalonario.js              ← navegación + selector mes/año + botones Excel
├── ResumenTalonario.js          ← auto-calculado, dos columnas
├── ingresos/
│   ├── CobrosEfectivo.js        ← lee cobros (forma_pago='efectivo')
│   ├── CobrosTransferencia.js   ← lee cobros (forma_pago IN transferencia, depósito)
│   └── CobrosCheques.js         ← lee cobros (forma_pago='cheque')
├── egresos/
│   ├── GastosEfectivo.js        ← lee caja_gastos (solo lectura)
│   ├── PagosDelMes.js           ← entrada manual → talonario_pagos_banco
│   └── PagosPersonales.js       ← entrada manual → talonario_pagos_personales (3 secciones)
├── compras/
│   ├── ComprasTalonario.js      ← lee tabla compras (solo lectura)
│   └── FacturasPersonales.js    ← entrada manual → talonario_facturas_personales
└── shared/
    ├── ExcelImport.js           ← subir Excel histórico con IA
    └── ExcelExport.js           ← descargar Excel idéntico al original
```

`TalonarioContext` expone: `{ mes, año, setMes, setAño, esAdminContador }`.

---

## 3. Navegación

**Barra superior fija:**
```
📒 TALONARIO  |  [DICIEMBRE ▾] [2025]  |  📥 Descargar Excel  📤 Subir Excel
```

**Pestañas agrupadas (Option A):**
```
[📊 RESUMEN] [💵 INGRESOS ▾] [💸 EGRESOS ▾] [🛒 COMPRAS ▾]
```

Submenús al hacer clic:

| Grupo | Secciones |
|---|---|
| INGRESOS | Cobros Efectivo · Cobros Transf./Depósito · Cobros Cheques |
| EGRESOS | Gastos Efectivo · Pagos del Mes · Pagos Personales |
| COMPRAS | Compras · Facturas Personales |

---

## 4. Base de datos

### Tablas nuevas

```sql
-- Facturas personales (gastos del negocio facturados a nombre personal)
CREATE TABLE talonario_facturas_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  proveedor text,
  descripcion text,
  monto numeric(12,2) NOT NULL,
  tiene_factura boolean DEFAULT true,
  forma_pago text,                -- '01'|'16'|'19'|'20'
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Pagos del mes (proveedores, servicios, IESS, nómina manual, etc.)
CREATE TABLE talonario_pagos_banco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,           -- 1-12
  año integer NOT NULL,
  fecha date,
  beneficiario text,
  concepto text,
  monto numeric(12,2) NOT NULL,
  forma_pago text,                -- '01'|'16'|'19'|'20'
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Pagos personales (préstamos, tarjetas, gastos personal, otros)
CREATE TABLE talonario_pagos_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  beneficiario text,
  concepto text,
  monto numeric(12,2) NOT NULL,
  categoria text NOT NULL,        -- 'prestamos'|'tarjetas'|'gastos_personal'|'otros'
  forma_pago text,                -- '01'|'16'|'19'|'20'
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Otros ingresos (3% Caranqui, devoluciones, ingresos extraordinarios)
CREATE TABLE talonario_otros_ingresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  descripcion text,
  monto numeric(12,2) NOT NULL,
  forma_pago text,                -- '01'|'16'|'19'|'20'
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Tablas existentes usadas (solo lectura)

| Tabla | Sección | Filtro |
|---|---|---|
| `cobros` | CONSOLIDADO ingresos | `fecha_cobro` en mes/año |
| `facturas` | MES ingresos | `fecha_emision` en mes/año |
| `caja_gastos` | Gastos Efectivo | `fecha` en mes/año |
| `compras` | Compras | `fecha` en mes/año |
| `nomina` | Resumen MES egresos | `mes`, `año` |
| `cuentas_cobrar` | Resumen CONSOLIDADO activos | saldo pendiente |
| `inventario` | Resumen CONSOLIDADO activos | último valor |

---

## 5. Lógica del Resumen (auto-calculado)

### Distinción clave: MES vs CONSOLIDADO

- **MES (devengo):** lo que se *generó/incurrió* en el mes, por fecha de factura/gasto
- **CONSOLIDADO (caja):** lo que *realmente movió dinero* ese mes, por fecha de cobro/pago

Una venta de enero cobrada en diciembre:
- Aparece en **enero MES** (factura emitida en enero)
- Aparece en **diciembre CONSOLIDADO** (cobro recibido en diciembre)
- NO aparece en diciembre MES

### Columna MES

```
INGRESOS
(+) Total ventas del mes       ← SUM(facturas.total) WHERE fecha_emision en mes/año
(+) Otros ingresos             ← SUM(talonario_otros_ingresos) WHERE mes/año

EGRESOS
(-) Gastos efectivo            ← SUM(caja_gastos) WHERE fecha en mes/año
(-) Proveedores con factura    ← SUM(compras.total) WHERE tiene_factura=true AND fecha en mes/año
(-) Proveedores sin factura    ← SUM(compras.total) WHERE tiene_factura=false AND fecha en mes/año
(-) Sueldos                    ← SUM(nomina.total_sueldo) WHERE mes/año
(-) IESS                       ← SUM(nomina.iess) WHERE mes/año
(-) [filas de talonario_pagos_banco agrupadas por concepto]
(-) [filas de talonario_pagos_personales agrupadas por categoría]

UTILIDAD BRUTA = TOTAL INGRESOS - TOTAL EGRESOS
```

### Columna CONSOLIDADO

```
INGRESOS (por forma de cobro real)
(+) Cobros efectivo            ← SUM(cobros) WHERE forma_pago='efectivo' AND fecha en mes/año
(+) Cobros cheque              ← SUM(cobros) WHERE forma_pago='cheque' AND fecha en mes/año
(+) Cobros transf./depósito    ← SUM(cobros) WHERE forma_pago IN ('transferencia','deposito') AND fecha en mes/año
(+) Otros ingresos             ← SUM(talonario_otros_ingresos) WHERE mes/año

EGRESOS (por fecha de pago real)
(-) Gastos efectivo            ← SUM(caja_gastos) WHERE fecha en mes/año
(-) Pagos con banco            ← SUM(talonario_pagos_banco) WHERE mes/año
(-) Tarjetas/préstamos         ← SUM(talonario_pagos_personales) WHERE categoria IN ('prestamos','tarjetas') AND mes/año
(-) Gastos personales          ← SUM(talonario_pagos_personales) WHERE categoria IN ('gastos_personal','otros') AND mes/año

ACTIVOS
(+) Inventario                 ← último valor registrado en inventario
(+) Cuentas por cobrar         ← SUM(cuentas_cobrar pendientes)
(-) Cuentas por pagar          ← SUM(compras pendientes de pago)

Saldo cuenta corriente         ← campo manual ingresado por admin/contador, guardado en config_contabilidad por mes/año
```

Todo se recalcula en tiempo real al cambiar mes/año. El Resumen no se guarda en BD.

---

## 6. Estructura de cada sección de datos

Todas las secciones (excepto Resumen) muestran una tabla con:

| Columna | Descripción |
|---|---|
| Fecha | Fecha del movimiento |
| Beneficiario / Descripción | Nombre o concepto |
| Monto | Valor numérico |
| Forma de pago | Dropdown con código SRI: Efectivo (01) · Débito (16) · Crédito (19) · Transf./Cheque/Depósito (20) |
| Comentario | Campo libre de texto, opcional |
| Acciones | Editar / Eliminar (solo admin/contador, solo en tablas manuales) |

Botón `+ Agregar` visible solo para admin/contador en secciones manuales.

Secciones de **solo lectura** (datos vienen de otros módulos): Gastos Efectivo, Cobros (los 3 tipos), Compras.

---

## 7. Códigos SRI de forma de pago

| Código | Descripción |
|---|---|
| `01` | Efectivo |
| `16` | Tarjeta de débito |
| `19` | Tarjeta de crédito |
| `20` | Transferencia bancaria / cheque / depósito |

Todos los registros (nuevos y existentes mapeados) llevan este código.

---

## 8. Excel — Importar y Exportar

### Exportar (📥 Descargar Excel)
- Genera `.xlsx` con la misma estructura que el Excel original del usuario
- Una hoja por sección: RESUMEN, GASTOS EFECTIVO, COBROS EFECTIVO, COBROS TRANSF/DEP, COBROS CHEQUES, PAGOS MES, OTROS PAGOS PERSONALES, COMPRAS, COMPRAS PERSONAL
- Incluye totales y formato visual similar al original
- Librería: `xlsx` (SheetJS)

### Importar (📤 Subir Excel) — principalmente para datos históricos
1. Usuario sube `.xlsx`
2. IA (Claude API) parsea cada hoja y mapea columnas → campos de BD
3. App muestra vista previa: filas nuevas vs. filas que ya existen
4. Usuario elige: **Importar todo** / **Solo las nuevas** / **Cancelar**
5. Se insertan registros en las tablas correspondientes

### Hotmail / extracción automática — Fase 2
- Por ahora: solo guardar dirección de email (campo en configuración)
- Fase 2: integración con Microsoft Graph API para leer estados de cuenta automáticamente

---

## 9. Permisos

| Acción | Roles |
|---|---|
| Ver cualquier sección | Todos |
| Agregar/editar/eliminar en secciones manuales | Solo `admin`, `contador` |
| Subir Excel | Solo `admin`, `contador` |
| Descargar Excel | Todos |

---

## 10. Integración con Libro Diario

Todos los movimientos del Talonario (especialmente pagos manuales y otros ingresos) deben eventualmente reflejarse en el Libro Diario. La integración directa queda **fuera del alcance de esta fase** — se aborda en una iteración posterior una vez que el Talonario esté operativo.

---

## Fuera del alcance (esta fase)

- Integración Hotmail / Microsoft Graph API
- Integración directa con Libro Diario
- Aprobaciones o flujo de revisión contable
- Multi-empresa
