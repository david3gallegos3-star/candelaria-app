# Talonario BANCO — Saldo Calculado y Diferencia (rediseño)

## Problema

En `src/components/contabilidad/talonario/banco/MovimientosBanco.js:163`:

```js
const dif = saldoNum - neto;
```

`saldoNum` es el **saldo real** del banco (nivel, ingresado manualmente desde el estado de cuenta) y `neto` es el **flujo del mes** (entradas - salidas). Restar un nivel menos un flujo no tiene sentido: si `neto` es negativo, la resta se vuelve una suma (ej. `11000 - (-50.67) = 11050.67`), produciendo un número sin significado contable.

`ResumenTalonario.js` tiene el mismo problema conceptual en su bloque "Saldo banco calculado vs Saldo banco real" (líneas 200-224): `saldoCalculadoBanco` es también solo el flujo del mes, no un saldo acumulado.

## Objetivo

`diferencia = saldoReal - saldoCalculado`, donde ambos son **niveles** (saldos de banco), no un nivel contra un flujo.

`saldoCalculado` de un mes se obtiene partiendo de un saldo base + el neto (flujo) de ese mes. El saldo base de cada mes es, en orden de prioridad:

1. El **saldo real** del mes anterior, si fue ingresado manualmente (rebase mensual — el saldo real es la verdad de campo).
2. Si no fue ingresado, el **saldo calculado** del mes anterior (recursión hacia atrás).
3. Si el mes es el mes del **Asiento Inicial** (Libro Diario → Asiento Inicial), el saldo base es `asiento_inicial.banco`.
4. Si no hay Asiento Inicial configurado, o el mes consultado es anterior al mes del Asiento Inicial, no hay base disponible → `saldoCalculado = neto` del mes (igual al comportamiento actual), marcado como "pendiente de configurar Asiento Inicial".

Este rebase mensual evita que errores de meses anteriores se acumulen indefinidamente: cada mes se evalúa contra su propio cierre real.

## Diseño

### 1. Nuevo util `src/utils/saldoBanco.js`

#### `calcularNetoBancoMes(año, mes)`

Extrae la lógica de fetch + suma que hoy vive inline en `MovimientosBanco.cargar()` (líneas 18-133), parametrizada por `año`/`mes` en vez de usar `fechaDesde`/`fechaHasta` del contexto. Calcula `fechaDesde`/`fechaHasta` igual que `TalonarioContext.js`:

```js
const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
const ultimoDia  = new Date(año, mes, 0).getDate();
const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
```

Ejecuta las mismas 8 queries (cobros transferencia/depósito/cheque + comisiones, otros ingresos no efectivo, pagos banco, facturas personales con forma_pago='20', ventas con metodo_pago transferencia/cheque, compras con forma_pago transferencia/cheque/depósito, entregas de caja chica) y devuelve:

```js
{ totalEntradas: number, totalSalidas: number, neto: number }
```

`MovimientosBanco.js` seguirá necesitando la lista detallada `movs` para la tabla (no solo los totales) — `calcularNetoBancoMes` es para los meses *distintos* al mes visible (usado por `calcularSaldoCalculado` al recursar hacia atrás). El mes visible sigue usando su propio `movs`/`neto` ya calculado en `cargar()`.

#### `calcularSaldoCalculado(año, mes)`

```js
function mesAnterior(año, mes) {
  return mes === 1 ? { año: año - 1, mes: 12 } : { año, mes: mes - 1 };
}

export async function calcularSaldoCalculado(año, mes, netoMes) {
  const { data: config } = await supabase
    .from('config_contabilidad').select('valor').eq('clave','asiento_inicial').single();
  const asientoInicial = config?.valor || {};

  if (!asientoInicial.completado) {
    return { saldoCalculado: netoMes, pendienteInicial: true };
  }

  const [añoIni, mesIni] = asientoInicial.fecha.split('-').map(Number);

  if (año < añoIni || (año === añoIni && mes < mesIni)) {
    return { saldoCalculado: netoMes, pendienteInicial: true };
  }

  if (año === añoIni && mes === mesIni) {
    return { saldoCalculado: asientoInicial.banco + netoMes, pendienteInicial: false };
  }

  // Rebase: base = saldo real del mes anterior, o saldo calculado del mes anterior (recursión)
  const { año: añoP, mes: mesP } = mesAnterior(año, mes);
  const { data: configPrev } = await supabase
    .from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${añoP}_${mesP}`).maybeSingle();
  const saldoRealPrev = configPrev?.valor?.saldo;

  let base;
  if (saldoRealPrev !== undefined && saldoRealPrev !== null && saldoRealPrev !== '') {
    base = parseFloat(saldoRealPrev);
  } else {
    const { neto: netoPrev } = await calcularNetoBancoMes(añoP, mesP);
    const prev = await calcularSaldoCalculado(añoP, mesP, netoPrev);
    base = prev.saldoCalculado;
  }

  return { saldoCalculado: base + netoMes, pendienteInicial: false };
}
```

Notas:
- `netoMes` se pasa como parámetro (el mes visible ya lo tiene calculado de `movs`; para meses anteriores se obtiene con `calcularNetoBancoMes`).
- La recursión está acotada por la distancia en meses hasta el mes del Asiento Inicial (o hasta encontrar un `saldo_banco_${año}_${mes}` guardado), lo cual es pequeño dado que el sistema es nuevo (2026).

### 2. `MovimientosBanco.js`

- Tras cargar `movs` y calcular `neto` (igual que ahora), llamar `calcularSaldoCalculado(año, mes, neto)` para obtener `{ saldoCalculado, pendienteInicial }`.
- Mantener la caja **NETO CALCULADO** (informativa, flujo del mes).
- Agregar caja **SALDO CALCULADO** mostrando `saldoCalculado`.
- **DIFERENCIA** = `saldoReal - saldoCalculado`:
  - `dif < -0.01` → rojo `#e74c3c`
  - `dif > 0.01` → tomate `#e67e22`
  - `|dif| <= 0.01` → verde `#27ae60` + "✓ Cuadra" (igual que ahora)
- Si `pendienteInicial`, mostrar badge junto a SALDO CALCULADO: "⚠️ Pendiente configurar Asiento Inicial (Libro Diario)". DIFERENCIA se sigue mostrando con el fallback (`saldoCalculado = neto`).

#### Nota explicativa de la diferencia

- Junto a la caja DIFERENCIA, un campo de texto (editable, igual estilo que el de SALDO REAL) para anotar por qué existe la diferencia ese mes (ej. "incluye gastos personales del dueño en la cuenta").
- Se guarda en `config_contabilidad`, clave `saldo_banco_${año}_${mes}`, agregando el campo `notaDiferencia`:
  ```js
  { saldo: val, notaDiferencia: '...' }
  ```
  (la función `guardarSaldo` existente se extiende para aceptar y guardar también `notaDiferencia`).
- Si `notaDiferencia` no está vacío, se agrega una fila informativa al final de la tabla de movimientos:
  - Descripción: `📝 Diferencia ${dif>0?'+':''}$${dif.toFixed(2)}: ${notaDiferencia}`
  - Esta fila NO participa en `totalEntradas`/`totalSalidas`/`neto` — es puramente informativa, se renderiza por separado (no se mezcla con el array `movs` que alimenta los cálculos).

### 3. `ResumenTalonario.js`

- Sustituir el cálculo de `saldoCalculadoBanco` (línea 78, suma manual de componentes) por una llamada a `calcularNetoBancoMes(año, mes)` (para obtener `neto`) seguida de `calcularSaldoCalculado(año, mes, neto)`.
- El bloque "Saldo banco calculado vs Saldo banco real" (líneas 199-224) usa `saldoCalculado` en vez de `saldoCalculadoBanco`, con el mismo esquema de colores (rojo/tomate/verde) y badge "pendiente Asiento Inicial" si aplica.
- Nota: esto cambia ligeramente el valor de "saldo banco calculado" en el Resumen, porque `calcularNetoBancoMes` incluye comisiones de cobros y facturas personales (que la fórmula anterior de `ResumenTalonario` no contaba) — esto lo hace consistente con el tab BANCO.

## Edge cases

- **Mes sin Asiento Inicial configurado**: `saldoCalculado = neto`, `pendienteInicial = true`, se muestra badge. Diferencia se calcula igual.
- **Mes anterior al mes del Asiento Inicial**: igual que el caso anterior.
- **Mes del Asiento Inicial**: `saldoCalculado = asiento_inicial.banco + neto`.
- **Meses posteriores sin saldo real ingresado en el mes anterior**: recursión hacia atrás hasta encontrar un saldo real guardado o llegar al mes del Asiento Inicial.

## Fuera de alcance

- No se modifica `TabAsientoInicial.js` ni el flujo de creación del Asiento Inicial.
- No se agrega caché de `saldoCalculado` en base de datos — se calcula en cada carga (aceptable dado el bajo volumen de meses).
