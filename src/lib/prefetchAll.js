import { supabaseReal } from '../supabase';
import { set, makeKey } from './readCache';

const TABLES = [
  'productos',
  'materias_primas',
  'categorias_productos',
  'categorias_mp',
  'clientes',
  'inventario_mp',
  'inventario_movimientos',
  'lotes_maduracion',
  'produccion_inyeccion',
  'produccion_diaria',
  'vista_horneado_config',
  'config_productos',
  'deshuese_config',
  'facturas',
  'facturas_detalle',
  'compras',
  'compras_detalle',
  'empleados',
  'nomina',
  'usuarios_roles',
  'formulaciones',
];

export async function prefetchAll() {
  for (const table of TABLES) {
    try {
      const { data, error } = await supabaseReal.from(table).select('*');
      if (!error && data) {
        await set(makeKey(table, {}), data);
      }
    } catch {
      // tabla sin permiso o inexistente — ignorar
    }
  }
}
