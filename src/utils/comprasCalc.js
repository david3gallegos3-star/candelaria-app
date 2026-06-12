export function calcularResumenItems(items) {
  let baseIva15 = 0, baseIva0 = 0, descuentoTotal = 0, ivaTotal = 0, subtotalTotal = 0;
  const otrasBases = {};

  for (const it of items) {
    const subtotal  = parseFloat(it.subtotal ?? it.monto) || 0;
    const descuento = parseFloat(it.descuento) || 0;
    const ivaPct    = parseFloat(it.iva_pct ?? 15);
    const base      = Math.max(0, subtotal - descuento);
    const iva       = parseFloat((base * ivaPct / 100).toFixed(2));

    subtotalTotal  += subtotal;
    descuentoTotal += descuento;
    ivaTotal       += iva;

    if (ivaPct === 15) baseIva15 += base;
    else if (ivaPct === 0) baseIva0 += base;
    else otrasBases[ivaPct] = (otrasBases[ivaPct] || 0) + base;
  }

  const total = subtotalTotal - descuentoTotal + ivaTotal;
  return { subtotalTotal, descuentoTotal, ivaTotal, baseIva15, baseIva0, otrasBases, total };
}
