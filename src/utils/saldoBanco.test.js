import { mesAnterior, clasificarMes, calcularDiferencia } from './saldoBanco';

describe('mesAnterior', () => {
  test('mes intermedio retrocede dentro del mismo año', () => {
    expect(mesAnterior(2026, 6)).toEqual({ año: 2026, mes: 5 });
  });

  test('enero retrocede a diciembre del año anterior', () => {
    expect(mesAnterior(2026, 1)).toEqual({ año: 2025, mes: 12 });
  });
});

describe('clasificarMes', () => {
  test('asiento inicial no completado -> pendiente', () => {
    const asientoInicial = { completado: false };
    expect(clasificarMes({ año: 2026, mes: 6, asientoInicial })).toBe('pendiente');
  });

  test('mes anterior al mes del asiento inicial -> pendiente', () => {
    const asientoInicial = { completado: true, fecha: '2026-05-15', banco: 1000 };
    expect(clasificarMes({ año: 2026, mes: 4, asientoInicial })).toBe('pendiente');
  });

  test('año anterior al año del asiento inicial -> pendiente', () => {
    const asientoInicial = { completado: true, fecha: '2026-05-15', banco: 1000 };
    expect(clasificarMes({ año: 2025, mes: 12, asientoInicial })).toBe('pendiente');
  });

  test('mismo mes y año del asiento inicial -> inicial', () => {
    const asientoInicial = { completado: true, fecha: '2026-05-15', banco: 1000 };
    expect(clasificarMes({ año: 2026, mes: 5, asientoInicial })).toBe('inicial');
  });

  test('mes posterior al mes del asiento inicial (mismo año) -> rebase', () => {
    const asientoInicial = { completado: true, fecha: '2026-05-15', banco: 1000 };
    expect(clasificarMes({ año: 2026, mes: 6, asientoInicial })).toBe('rebase');
  });

  test('año posterior al año del asiento inicial -> rebase', () => {
    const asientoInicial = { completado: true, fecha: '2025-05-15', banco: 1000 };
    expect(clasificarMes({ año: 2026, mes: 1, asientoInicial })).toBe('rebase');
  });
});

describe('calcularDiferencia', () => {
  test('saldo real menor que el calculado -> diferencia negativa, rojo', () => {
    const r = calcularDiferencia(900, 1000);
    expect(r.dif).toBeCloseTo(-100);
    expect(r.cuadra).toBe(false);
    expect(r.color).toBe('#e74c3c');
  });

  test('saldo real mayor que el calculado -> diferencia positiva, tomate', () => {
    const r = calcularDiferencia(1100, 1000);
    expect(r.dif).toBeCloseTo(100);
    expect(r.cuadra).toBe(false);
    expect(r.color).toBe('#e67e22');
  });

  test('saldo real igual al calculado -> cuadra, verde', () => {
    const r = calcularDiferencia(1000, 1000);
    expect(r.dif).toBeCloseTo(0);
    expect(r.cuadra).toBe(true);
    expect(r.color).toBe('#27ae60');
  });

  test('saldoReal vacío se trata como 0', () => {
    const r = calcularDiferencia('', 0);
    expect(r.dif).toBe(0);
    expect(r.cuadra).toBe(true);
  });
});
