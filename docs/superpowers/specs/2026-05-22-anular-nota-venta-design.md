# Anular Nota de Venta — Implementation Design

**Goal:** Permitir anular una nota de venta interna desde TabFacturas, revirtiendo el asiento contable y cancelando la cuenta por cobrar si había crédito.

**Architecture:** Se añade `revertirAsientoNotaVenta()` en `asientosContables.js` que genera el contra-asiento (líneas invertidas). `TabFacturas` añade estado `modalAnularNV`, función `anularNotaVenta()`, botón "🚫 Anular" en la fila (solo para `tipo='nota_venta' && estado='autorizada'`), y un modal de confirmación simple sin campo de motivo.

**Tech Stack:** React 18, Supabase (PostgREST), función existente `insertarAsiento` en `asientosContables.js`.

---

## 1. `asientosContables.js` — Nueva función `revertirAsientoNotaVenta()`

```js
export async function revertirAsientoNotaVenta(factura) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaDebe = factura.metodo_pago === 'credito'
    ? cuentas.cxc_id
    : cuentas.caja_general_id;
  const descripcion = `Anulación NV - ${factura.numero} - ${factura.cliente_nombre}`;

  const lineas = [
    { cuenta_id: cuentas.ventas_internas_id, descripcion, debe: factura.total, haber: 0, orden: 0 },
    { cuenta_id: cuentaDebe,                 descripcion, debe: 0, haber: factura.total, orden: 1 },
  ];

  return insertarAsiento({
    fecha,
    descripcion,
    tipo: 'interno',
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}
```

El asiento original de la nota de venta era:
- DEBE: Caja/CxC por `total`
- HABER: Ventas Internas por `total`

El contra-asiento invierte las líneas:
- DEBE: Ventas Internas por `total`
- HABER: Caja/CxC por `total`

---

## 2. `TabFacturas.js`

### Estado nuevo
```js
const [modalAnularNV, setModalAnularNV] = useState(null); // factura a anular
const [anulandoNV,    setAnulandoNV]    = useState(false);
```

### Función `anularNotaVenta(f)`
```js
async function anularNotaVenta(f) {
  setAnulandoNV(true);
  try {
    await supabase.from('facturas')
      .update({ estado: 'anulada' })
      .eq('id', f.id);

    await supabase.from('cuentas_cobrar')
      .update({ estado: 'anulada' })
      .eq('factura_id', f.id)
      .eq('estado', 'pendiente');

    await revertirAsientoNotaVenta({
      id:             f.id,
      numero:         f.numero,
      total:          parseFloat(f.total),
      cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
      metodo_pago:    f.forma_pago,
    });

    setModalAnularNV(null);
    mostrarExito('✅ Nota de venta anulada');
    cargarFacturas();
  } catch (e) {
    alert('Error al anular: ' + e.message);
  }
  setAnulandoNV(false);
}
```

### Botón en la fila
Aparece cuando `f.tipo === 'nota_venta' && f.estado === 'autorizada'`:
```jsx
{f.tipo === 'nota_venta' && f.estado === 'autorizada' && (
  <button onClick={() => setModalAnularNV(f)} style={{
    background: 'white', color: '#e74c3c',
    border: '1.5px solid #e74c3c',
    borderRadius: 7, padding: '6px 12px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  }}>🚫 Anular</button>
)}
```

### Modal de confirmación
Simple, sin campo de motivo (es documento interno):
```jsx
{modalAnularNV && (
  <div style={{ /* overlay */ }}>
    <div style={{ /* modal box */ }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: 8 }}>
        ¿Anular nota de venta?
      </div>
      <div style={{ fontSize: '13px', color: '#555', marginBottom: 16 }}>
        {modalAnularNV.numero} — {modalAnularNV.cliente_nombre || 'CONSUMIDOR FINAL'}
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: 20 }}>
        Se revertirá el asiento contable. Esta acción no se puede deshacer.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => setModalAnularNV(null)}
          disabled={anulandoNV} style={{ /* estilo secundario */ }}>
          Cancelar
        </button>
        <button onClick={() => anularNotaVenta(modalAnularNV)}
          disabled={anulandoNV} style={{ /* estilo rojo */ }}>
          {anulandoNV ? '⏳ Anulando...' : '🚫 Sí, anular'}
        </button>
      </div>
    </div>
  </div>
)}
```

---

## 3. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/utils/asientosContables.js` | Añadir `revertirAsientoNotaVenta()` |
| `src/components/facturacion/TabFacturas.js` | Estado, función, botón, modal |

---

## 4. Lo que NO cambia

- El flujo `anularFactura()` de facturas normales no se toca
- No se crea entrada en `notas_credito` (solo aplica a facturas SRI)
- No se toca inventario (las NV no afectan inventario en este sistema)
- El número `NV-001-001-XXXXXXXXX` queda como anulado — no se reutiliza
