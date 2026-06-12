import { calcularResumenItems } from './comprasCalc';

describe('calcularResumenItems', () => {
  test('un item con IVA 15% sin descuento (factura Quimatec)', () => {
    const items = [{ subtotal: 46, descuento: 0, iva_pct: 15 }];
    const r = calcularResumenItems(items);
    expect(r.baseIva15).toBeCloseTo(46);
    expect(r.baseIva0).toBe(0);
    expect(r.descuentoTotal).toBe(0);
    expect(r.ivaTotal).toBeCloseTo(6.90);
    expect(r.total).toBeCloseTo(52.90);
  });

  test('items mixtos: IVA 15% con descuento y IVA 0% sin descuento', () => {
    const items = [
      { subtotal: 100, descuento: 10, iva_pct: 15 },
      { subtotal: 50, descuento: 0, iva_pct: 0 },
    ];
    const r = calcularResumenItems(items);
    expect(r.baseIva15).toBeCloseTo(90);
    expect(r.baseIva0).toBeCloseTo(50);
    expect(r.descuentoTotal).toBeCloseTo(10);
    expect(r.ivaTotal).toBeCloseTo(13.5);
    expect(r.subtotalTotal).toBeCloseTo(150);
    expect(r.total).toBeCloseTo(153.5);
  });

  test('otra tasa de IVA (5%) se agrupa en otrasBases', () => {
    const items = [{ subtotal: 20, descuento: 0, iva_pct: 5 }];
    const r = calcularResumenItems(items);
    expect(r.baseIva15).toBe(0);
    expect(r.baseIva0).toBe(0);
    expect(r.otrasBases['5']).toBeCloseTo(20);
    expect(r.ivaTotal).toBeCloseTo(1);
  });

  test('items de factura personal usan el campo monto en lugar de subtotal', () => {
    const items = [{ monto: 30, descuento: 5, iva_pct: 15 }];
    const r = calcularResumenItems(items);
    expect(r.baseIva15).toBeCloseTo(25);
    expect(r.ivaTotal).toBeCloseTo(3.75);
    expect(r.total).toBeCloseTo(28.75);
  });

  test('lista vacía devuelve todo en cero', () => {
    const r = calcularResumenItems([]);
    expect(r.subtotalTotal).toBe(0);
    expect(r.descuentoTotal).toBe(0);
    expect(r.ivaTotal).toBe(0);
    expect(r.baseIva15).toBe(0);
    expect(r.baseIva0).toBe(0);
    expect(r.total).toBe(0);
    expect(r.otrasBases).toEqual({});
  });
});
