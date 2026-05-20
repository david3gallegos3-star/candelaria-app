# Libro Diario Contable — Spec de Diseño
**Fecha:** 2026-05-19  
**Proyecto:** Candelaria App  
**Estado:** Aprobado

---

## 1. Objetivo

Construir el "cerebro contable" de Candelaria: un Libro Diario de doble entrada que unifique automáticamente los movimientos de Facturación, Compras, Nómina, Caja Chica e Inventario. Usado por David (control diario / Vista Gerencial) y la contadora (revisión formal / Vista SRI).

---

## 2. Usuarios y vistas

| Usuario | Vista | Propósito |
|---------|-------|-----------|
| David | 👔 Gerencial | Control diario, ver cuadre instantáneo, confirmar asientos |
| Contadora | 🏛️ SRI | Revisar asientos tributarios, exportar, confirmar formalmente |

El toggle Gerencial/SRI filtra visibilidad de cuentas fiscales (IVA, retenciones) que solo son relevantes en vista SRI.

---

## 3. Base de datos — 4 tablas nuevas

### 3.1 `cuentas_contables`
Plan de Cuentas Ecuador estándar, 4 niveles jerárquicos.

```sql
id          uuid PK
codigo      text UNIQUE        -- "1.1.1.01"
nombre      text               -- "Caja General"
tipo        text               -- activo | pasivo | patrimonio | ingreso | gasto
nivel       int                -- 1=grupo, 2=subgrupo, 3=cuenta, 4=subcuenta
naturaleza  text               -- deudora | acreedora
activa      boolean DEFAULT true
```

Viene pre-cargada con el Plan de Cuentas mínimo necesario para Candelaria (ver Sección 7).

### 3.2 `libro_diario`
Cabecera de cada asiento contable.

```sql
id              uuid PK DEFAULT gen_random_uuid()
fecha           date NOT NULL
descripcion     text NOT NULL
tipo            text NOT NULL    -- tributario | interno
origen          text NOT NULL    -- facturacion | compras | nomina | caja_chica | manual | asiento_inicial
origen_id       uuid             -- FK flexible: factura.id / compra.id / nomina.id / etc.
estado          text DEFAULT 'provisional'  -- provisional | confirmado | eliminado
confirmado_por  text             -- email del usuario que confirmó
confirmado_at   timestamptz
created_at      timestamptz DEFAULT now()
created_by      text
```

**Regla de estado:** `provisional → confirmado` es irreversible. Solo se puede pasar a `eliminado` desde `provisional`.

### 3.3 `libro_diario_detalle`
Líneas de cada asiento (mínimo 2 por asiento para garantizar partida doble).

```sql
id           uuid PK DEFAULT gen_random_uuid()
asiento_id   uuid NOT NULL REFERENCES libro_diario(id) ON DELETE CASCADE
cuenta_id    uuid NOT NULL REFERENCES cuentas_contables(id)
descripcion  text
debe         numeric(12,2) DEFAULT 0
haber        numeric(12,2) DEFAULT 0
orden        int DEFAULT 0
```

**Invariante:** `SELECT SUM(debe) - SUM(haber) FROM libro_diario_detalle WHERE asiento_id = X` debe ser siempre `0`.

### 3.4 `config_contabilidad`
Configuración del sistema contable: asiento inicial y mapeo de cuentas por módulo.

```sql
clave  text PK
valor  jsonb NOT NULL
```

Filas clave:
```json
{ "clave": "asiento_inicial",
  "valor": { "completado": false, "fecha": null, "banco": 0, "caja": 0, "inventario": 0, "patrimonio": 0 } }

{ "clave": "cuentas_modulos",
  "valor": {
    "caja_chica_id":        "<uuid cuenta Caja Chica>",
    "banco_id":             "<uuid cuenta Bancos>",
    "ventas_gravadas_id":   "<uuid cuenta Ventas 15% IVA>",
    "ventas_internas_id":   "<uuid cuenta Ingresos Gerenciales>",
    "inventario_mp_id":     "<uuid cuenta Inventario MP>",
    "cxc_id":               "<uuid cuenta CxC>",
    "cxp_id":               "<uuid cuenta CxP>",
    "iva_ventas_id":        "<uuid cuenta IVA Ventas>",
    "iva_compras_id":       "<uuid cuenta IVA Compras>",
    "sueldos_id":           "<uuid cuenta Gasto Sueldos>",
    "iess_patronal_id":     "<uuid cuenta IESS Patronal>"
  }
}
```

**Regla de Mapeo Dinámico de Caja (Regla #3):** `caja_chica_id` en `cuentas_modulos` es el vínculo directo entre el módulo TabCajaChica y el Libro Diario. El cierre diario lee este `cuenta_id` para construir el asiento exacto de Caja.

---

## 4. Reglas del sistema

### Regla 1 — Notas de Venta Internas (tipo: interno)

Cuando `libro_diario.tipo = 'interno'`:
- **NO** se calcula ni registra IVA.
- El asiento va directo a `ventas_internas_id` (cuenta de Ingresos Gerenciales), **no** a `ventas_gravadas_id`.
- No aparece en Vista SRI, solo en Vista Gerencial.

```
Asiento INTERNO (Nota de Venta):
  DEBE:  Caja / Banco / CxC       $XXX
  HABER: Ingresos Gerenciales     $XXX
  (sin línea de IVA)
```

### Regla 2 — Trazabilidad ATS en Compras

- El botón ATS SRI **permanece en el módulo Compras** (maneja XML nativos del proveedor).
- Cada compra guardada en `compras` **gatilla en tiempo real** la creación de su asiento en `libro_diario` + `libro_diario_detalle` (Opción C híbrida: doble escritura inmediata + botón Sincronizar como red de seguridad).
- `libro_diario.origen = 'compras'` y `origen_id = compra.id` permiten trazar de vuelta al XML/ATS original.

```
Asiento COMPRA:
  DEBE:  Inventario Materia Prima   $subtotal
  DEBE:  IVA en Compras             $iva        (si factura con IVA)
  HABER: Cuentas por Pagar          $total      (si crédito)
  HABER: Bancos / Caja              $total      (si contado)
```

### Regla 3 — Mapeo Dinámico de Caja

- `config_contabilidad` guarda en `cuentas_modulos.caja_chica_id` el `uuid` de la cuenta contable asignada a Caja Chica.
- TabCajaChica al ejecutar cierre diario lee `caja_chica_id` de esta config para construir el asiento.
- Si el administrador cambia la cuenta de Caja Chica (ej: abre una segunda caja), solo actualiza este `caja_chica_id` y todos los cierres futuros apuntan al nuevo lugar automáticamente.

---

## 5. Asientos automáticos por módulo

| Módulo | Evento | DEBE | HABER |
|--------|--------|------|-------|
| Facturación (tributario) | Factura autorizada | CxC | Ventas + IVA Ventas |
| Facturación (interno) | Nota de venta | Caja/CxC | Ingresos Gerenciales |
| Facturación | Cobro recibido | Banco/Caja | CxC |
| Compras | Compra guardada | Inventario MP + IVA Compras | CxP o Banco |
| Nómina | Rol de pagos confirmado | Gasto Sueldos | Bancos |
| Nómina | IESS patronal | Gasto IESS Patronal | IESS por Pagar |
| Caja Chica | Cierre diario | Caja (si ingreso) / Gastos (si gasto) | Contrapartida según tipo |
| Asiento Inicial | Configuración inicial | Banco + Caja + Inventario | Patrimonio (Capital) |

---

## 6. UI — Layout aprobado (Opción A refinada)

### Barra superior
- Selector de período (mes/año)
- Toggle **👔 Gerencial / 🏛️ SRI**
- Botón **🔄 Sincronizar** (morado) — red de seguridad, escanea registros sin asiento
- Botón **📥 Exportar**
- Botón **+ Asiento manual**

### KPI Cards (4 bloques)
`DEBE TOTAL` | `HABER TOTAL` | `BALANCE ✓ $0` | `PENDIENTES (n)`

### Tabs
1. **📊 Resumen** — KPIs + tabla de asientos con filtros
2. **📋 Asientos** — tabla paginada completa
3. **📈 Plan de Cuentas** — árbol jerárquico editable
4. **⚙️ Asiento Inicial** — wizard de configuración inicial

### Tabla de asientos
- Agrupada por asiento (cabecera coloreada por módulo)
- Columnas: Fecha | Código | Descripción | Cuenta | Debe | Haber | Estado
- Filtros rápidos: Todos / Confirmados / Provisionales / por módulo
- Acción masiva: **✓ Confirmar N provisionales**

### Flujo de estados en UI
`⏳ Provisional` (amarillo) → contadora revisa → `✓ Confirmado` (verde) o `🗑 Eliminado` (gris)

---

## 7. Plan de Cuentas mínimo pre-cargado

```
1. ACTIVO
  1.1 Activo Corriente
    1.1.1 Caja y Bancos
      1.1.1.01 Caja General
      1.1.1.02 Caja Chica
      1.1.1.03 Bancos
    1.1.2 Cuentas por Cobrar
      1.1.2.01 Clientes
    1.1.3 Inventarios
      1.1.3.01 Inventario Materia Prima
      1.1.3.02 Inventario Producto Terminado
    1.1.4 IVA
      1.1.4.01 IVA en Compras

2. PASIVO
  2.1 Pasivo Corriente
    2.1.1 Cuentas por Pagar
      2.1.1.01 Proveedores
    2.1.2 Obligaciones Laborales
      2.1.2.01 IESS por Pagar
      2.1.2.02 Sueldos por Pagar
    2.1.3 Obligaciones Tributarias
      2.1.3.01 IVA Ventas por Pagar
      2.1.3.02 Retenciones por Pagar

3. PATRIMONIO
  3.1 Capital
    3.1.1.01 Capital Social

4. INGRESOS
  4.1 Ingresos Operacionales
    4.1.1.01 Ventas 15% IVA
    4.1.1.02 Ingresos Gerenciales (Notas de Venta Internas)

5. GASTOS
  5.1 Gastos Operacionales
    5.1.1.01 Gasto Sueldos y Salarios
    5.1.1.02 Gasto IESS Patronal
    5.1.1.03 Gasto Caja Chica
    5.1.1.04 Costo Materia Prima
```

---

## 8. Componentes de código a crear

| Archivo | Descripción |
|---------|-------------|
| `src/LibroDiario.js` | Pantalla principal con tabs y KPIs |
| `src/components/libroDiario/TabResumen.js` | Tab resumen + tabla asientos |
| `src/components/libroDiario/TabPlanCuentas.js` | Árbol plan de cuentas |
| `src/components/libroDiario/TabAsientoInicial.js` | Wizard asiento inicial |
| `src/utils/asientosContables.js` | Generadores automáticos por módulo |
| `supabase/migrations/20260519_libro_diario.sql` | Migración completa |

---

## 9. Integración con módulos existentes

- **TabNuevaVenta.js** — después de `emitirFactura()` o `guardarBorrador()` exitoso → llamar `generarAsientoFactura(factura, tipo)`
- **TabIngresoCompra.js** — después de guardar compra → llamar `generarAsientoCompra(compra)`
- **TabNomina.js** — después de confirmar nómina → llamar `generarAsientoNomina(nomina)`
- **TabCajaChica.js** — al ejecutar cierre diario → llamar `generarAsientoCierre(cierre, caja_chica_id)`

Todos los generadores están en `src/utils/asientosContables.js` y son funciones puras que reciben el registro fuente y devuelven el asiento a insertar.

---

## 10. Ruta en la app

`MenuPrincipal → Contabilidad → MenuContabilidad → Libro Diario`

Se agrega "📒 Libro Diario" como submodulo en `MenuContabilidad.js`.
