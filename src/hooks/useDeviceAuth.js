import { supabase } from '../supabase';
import { crearNotificacion } from '../utils/helpers';

const DEVICE_KEY = 'candelaria_device_id';

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function verificarDispositivo(userId, rol) {
  if (rol === 'admin') return 'aprobado';

  const deviceId = getOrCreateDeviceId();

  const { data } = await supabase
    .from('dispositivos_autorizados')
    .select('estado')
    .eq('uuid', deviceId)
    .single();

  if (!data) {
    await supabase.from('dispositivos_autorizados').insert({
      uuid:    deviceId,
      user_id: userId,
      estado:  'pendiente',
    });
    crearNotificacion({
      tipo:    'dispositivo_nuevo',
      origen:  'auth',
      mensaje: 'Nuevo dispositivo solicita acceso',
    });
    return 'pendiente';
  }

  return data.estado;
}
