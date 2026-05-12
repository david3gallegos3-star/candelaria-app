import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const CANAL = 'presencia-candelaria';

const NOMBRES_PANTALLA = {
  login:               'Inicio de sesión',
  menuPrincipal:       'Menú principal',
  formulacion:         'Formulación',
  produccion:          'Producción',
  inventario:          'Inventario',
  historialmp:         'Historial MP',
  materias:            'Materias primas',
  modcif:              'CIF',
  resumen:             'Resumen precios',
  clientes:            'Clientes',
  facturacion:         'Facturación',
  compras:             'Compras',
  conciliacion:        'Conciliación',
  rrhh:                'RRHH',
  trazabilidad:        'Trazabilidad',
  dashboard:           'Dashboard',
  auditoria:           'Auditoría',
  historial:           'Historial lotes',
  inventarioproduccion:'Inv. producción',
  gemini:              'Asistente IA',
};

export function usePresence(user, userRol, pantalla) {
  const channelRef   = useRef(null);
  const pantallaRef  = useRef(pantalla);
  const actividadRef = useRef('conectado');
  const debounceRef  = useRef(null);
  const [presentes, setPresentes] = useState([]);

  function track(extra = {}) {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      user_id:    user.id,
      email:      user.email,
      nombre:     userRol?.nombre || user.email,
      pantalla:   pantallaRef.current,
      pantalla_label: NOMBRES_PANTALLA[pantallaRef.current] || pantallaRef.current,
      actividad:  actividadRef.current,
      ...extra,
    });
  }

  function onInput() {
    if (actividadRef.current !== 'editando') {
      actividadRef.current = 'editando';
      track();
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      actividadRef.current = 'navegando';
      track();
    }, 4000);
  }

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(CANAL, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const lista = Object.values(state).flat();
      setPresentes(lista);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        actividadRef.current = 'conectado';
        track();
      }
    });

    document.addEventListener('keydown', onInput);
    document.addEventListener('input',   onInput);

    return () => {
      channel.untrack();
      channel.unsubscribe();
      document.removeEventListener('keydown', onInput);
      document.removeEventListener('input',   onInput);
      clearTimeout(debounceRef.current);
      channelRef.current = null;
    };
  }, [user]);

  // Actualizar pantalla cuando cambia
  useEffect(() => {
    pantallaRef.current = pantalla;
    if (actividadRef.current !== 'editando') {
      actividadRef.current = 'navegando';
    }
    track();
  }, [pantalla]);

  return { presentes };
}
