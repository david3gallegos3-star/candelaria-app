export function mesAnterior(año, mes) {
  return mes === 1 ? { año: año - 1, mes: 12 } : { año, mes: mes - 1 };
}

export function clasificarMes({ año, mes, asientoInicial }) {
  if (!asientoInicial?.completado) return 'pendiente';

  const [añoIni, mesIni] = asientoInicial.fecha.split('-').map(Number);

  if (año < añoIni || (año === añoIni && mes < mesIni)) return 'pendiente';
  if (año === añoIni && mes === mesIni) return 'inicial';
  return 'rebase';
}

export function calcularDiferencia(saldoReal, saldoCalculado) {
  const dif = parseFloat(saldoReal || 0) - saldoCalculado;
  const cuadra = Math.abs(dif) < 0.01;
  const color = cuadra ? '#27ae60' : dif < 0 ? '#e74c3c' : '#e67e22';
  return { dif, cuadra, color };
}
