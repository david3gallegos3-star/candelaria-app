import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

let channelCount = 0;

export function useRealtime(tables, onRefresh) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const tablesArr = Array.isArray(tables) ? tables : [tables];
    const channelName = `rt-${channelCount++}-${[...tablesArr].sort().join('-')}`;
    const canal = supabase.channel(channelName);

    tablesArr.forEach(table => {
      canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        onRefreshRef.current();
      });
    });

    canal.subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
