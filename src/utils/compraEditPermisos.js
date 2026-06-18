export function puedeEditarCompra(compra, userRol) {
  const dias = (Date.now() - new Date(compra.created_at).getTime()) / 86400000;
  if (dias <= 7) return { permitido: true, soloAdmin: false };
  if (userRol?.rol === 'admin') return { permitido: true, soloAdmin: true };
  return { permitido: false, soloAdmin: true };
}
