import { generarTextoQz } from './imprimirTicket';

const CORTE = '\x1D\x56\x00'; // GS V 0 - corte total de papel
const INIT  = '\x1B\x40';     // ESC @ - inicializar impresora

function contarCortes(texto) {
  return texto.split(CORTE).length - 1;
}

describe('generarTextoQz', () => {
  test('repetir=1 genera 2 bloques (CLIENTE, EMPRESA) con 2 cortes', () => {
    const [texto] = generarTextoQz('CUERPO', 1);
    expect(contarCortes(texto)).toBe(2);
  });

  test('repetir=2 (copiaExtra) genera 4 bloques con 4 cortes', () => {
    const [texto] = generarTextoQz('CUERPO', 2);
    expect(contarCortes(texto)).toBe(4);
  });

  test('cada bloque cortado contiene su separador CLIENTE/EMPRESA antes del corte', () => {
    const [texto] = generarTextoQz('CUERPO', 1);
    const bloques = texto.split(CORTE);
    expect(bloques[0]).toContain('CUERPO');
    expect(bloques[0]).toContain('COPIA CLIENTE');
    expect(bloques[1]).toContain('CUERPO');
    expect(bloques[1]).toContain('COPIA EMPRESA');
  });

  test('inicia con el comando de inicializacion ESC @', () => {
    const [texto] = generarTextoQz('CUERPO', 1);
    expect(texto.startsWith(INIT)).toBe(true);
  });

  test('cada bloque incluye lineas en blanco antes del corte', () => {
    const [texto] = generarTextoQz('CUERPO', 1);
    const bloques = texto.split(CORTE);
    expect(bloques[0].endsWith(' \n \n')).toBe(true);
  });
});
