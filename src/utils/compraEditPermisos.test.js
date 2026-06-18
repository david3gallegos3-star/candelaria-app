import { puedeEditarCompra } from './compraEditPermisos';

describe('puedeEditarCompra', () => {
  test('compra creada hoy es editable por cualquier rol', () => {
    const compra = { created_at: new Date().toISOString() };
    const r = puedeEditarCompra(compra, { rol: 'bodeguero' });
    expect(r).toEqual({ permitido: true, soloAdmin: false });
  });

  test('compra de hace 3 dias sigue editable por cualquier rol', () => {
    const hace3dias = new Date(Date.now() - 3 * 86400000).toISOString();
    const compra = { created_at: hace3dias };
    const r = puedeEditarCompra(compra, { rol: 'bodeguero' });
    expect(r).toEqual({ permitido: true, soloAdmin: false });
  });

  test('compra de hace 8 dias: admin puede editar, marcado soloAdmin', () => {
    const hace8dias = new Date(Date.now() - 8 * 86400000).toISOString();
    const compra = { created_at: hace8dias };
    const r = puedeEditarCompra(compra, { rol: 'admin' });
    expect(r).toEqual({ permitido: true, soloAdmin: true });
  });

  test('compra de hace 8 dias: rol no-admin no puede editar', () => {
    const hace8dias = new Date(Date.now() - 8 * 86400000).toISOString();
    const compra = { created_at: hace8dias };
    const r = puedeEditarCompra(compra, { rol: 'bodeguero' });
    expect(r).toEqual({ permitido: false, soloAdmin: true });
  });

  test('compra de hace 8 dias sin userRol no puede editar', () => {
    const hace8dias = new Date(Date.now() - 8 * 86400000).toISOString();
    const compra = { created_at: hace8dias };
    const r = puedeEditarCompra(compra, null);
    expect(r).toEqual({ permitido: false, soloAdmin: true });
  });

  test('exactamente 7 dias todavia cuenta como dentro de la ventana', () => {
    const hace7dias = new Date(Date.now() - 7 * 86400000 + 1000).toISOString();
    const compra = { created_at: hace7dias };
    const r = puedeEditarCompra(compra, { rol: 'bodeguero' });
    expect(r.permitido).toBe(true);
    expect(r.soloAdmin).toBe(false);
  });
});
