import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

let channelCount = 0;

export function useRealtime(tables, onRefresh) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const tablesArr = Array.isArray(tables) ? tables : [tables];
    let canal = null;

    function suscribir() {
      if (canal) supabase.removeChannel(canal);
      const channelName = `rt-${channelCount++}-${[...tablesArr].sort().join('-')}`;
      canal = supabase.channel(channelName);
      tablesArr.forEach(table => {
        canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          onRefreshRef.current();
        });
      });
      canal.subscribe();
    }

    function alVolverVisible() {
      if (document.visibilityState === 'visible') {
        onRefreshRef.current();
        suscribir();
      }
    }

    suscribir();
    document.addEventListener('visibilitychange', alVolverVisible);

    return () => {
      document.removeEventListener('visibilitychange', alVolverVisible);
      if (canal) supabase.removeChannel(canal);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
