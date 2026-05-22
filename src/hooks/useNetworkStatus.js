import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseReal } from '../supabase';
import * as offlineQueue from '../lib/offlineQueue';

const CONSUMIDOR_FINAL = {
  id: null, nombre: 'CONSUMIDOR FINAL',
  ruc: '9999999999999', email: '', telefono: '', direccion: ''
};

export function useNetworkStatus() {
  const [isOnline,            setIsOnline]            = useState(true);
  const [queueCount,          setQueueCount]          = useState(() => offlineQueue.getTotalCount());
  const [syncErrors,          setSyncErrors]          = useState([]);
  const [isSyncing,           setIsSyncing]           = useState(false);
  const [lastSynced,          setLastSynced]          = useState(null);
  const [borradoresCount,     setBorradoresCount]     = useState(0);
  const [isSyncingBorradores, setIsSyncingBorradores] = useState(false);
  const [lastBorradorSync,    setLastBorradorSync]    = useState(null);
  const syncingRef           = useRef(false);
  const syncingBorradoresRef = useRef(false);

  const refreshQueue = useCallback(() => {
    setQueueCount(offlineQueue.getTotalCount());
    setSyncErrors(offlineQueue.getQueue().filter(i => i.status === 'error'));
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const pending = offlineQueue.getQueue().filter(i => i.status === 'pending');
    if (pending.length === 0) { refreshQueue(); return; }

    syncingRef.current = true;
    setIsSyncing(true);
    let synced = 0;

    for (const item of pending) {
      offlineQueue.markSyncing(item.id);
      try {
        await executeItem(item);
        offlineQueue.markSynced(item.id);
        synced++;
      } catch (e) {
        offlineQueue.markError(item.id, e.message || 'Error desconocido');
      }
    }

    setIsSyncing(false);
    syncingRef.current = false;
    if (synced > 0) setLastSynced({ count: synced, time: new Date() });
    refreshQueue();
    return synced;
  }, [refreshQueue]);

  // ── Auto-emitir borradores al SRI cuando hay internet ────
  const syncBorradores = useCallback(async () => {
    if (syncingBorradoresRef.current) return;

    try {
      const { data: borradores } = await supabaseReal.from('facturas')
        .select('*').eq('estado', 'borrador').is('deleted_at', null);

      if (!borradores?.length) { setBorradoresCount(0); return; }
      setBorradoresCount(borradores.length);

      syncingBorradoresRef.current = true;
      setIsSyncingBorradores(true);
      let emitidos = 0;

      for (const f of borradores) {
        try {
          const clienteData = f.cliente_id
            ? (await supabaseReal.from('clientes').select('*').eq('id', f.cliente_id).single()).data
            : CONSUMIDOR_FINAL;
          if (!clienteData) continue;

          const { data: detalleData } = await supabaseReal.from('facturas_detalle')
            .select('*').eq('factura_id', f.id);
          if (!detalleData?.length) continue;

          const secuencial = parseInt(f.numero.split('-').pop(), 10);

          const res = await fetch('/api/emitir-factura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cliente:      clienteData,
              items:        detalleData,
              formaPago:    f.forma_pago,
              diasCredito:  f.dias_credito || 0,
              observaciones: f.observaciones || '',
              vendedor:     f.vendedor || '',
              secuencial
            })
          });
          const data = await res.json();
          if (!data.ok) continue;

          await supabaseReal.from('facturas').update({
            estado:           'autorizada',
            autorizacion_sri: data.autorizacion,
            datil_id:         data.datil_id,
            pdf_url:          data.pdf_url,
            xml_url:          data.xml_url,
          }).eq('id', f.id);
          emitidos++;
        } catch { /* continuar con el siguiente borrador */ }
      }

      setBorradoresCount(borradores.length - emitidos);
      if (emitidos > 0) setLastBorradorSync({ count: emitidos, time: new Date() });
    } catch { /* silencioso */ } finally {
      syncingBorradoresRef.current = false;
      setIsSyncingBorradores(false);
    }
  }, []);

  useEffect(() => {
    const onOnline = async () => {
      setIsOnline(true);
      await syncQueue();
      await syncBorradores();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    const interval = setInterval(refreshQueue, 2000);

    // Contar borradores pendientes al iniciar sesión
    supabaseReal.from('facturas')
      .select('id').eq('estado', 'borrador').is('deleted_at', null)
      .then(({ data }) => setBorradoresCount(data?.length || 0))
      .catch(() => {});

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [syncQueue, refreshQueue, syncBorradores]);

  return {
    isOnline,
    queueCount,
    syncErrors,
    isSyncing,
    lastSynced,
    syncNow:     syncQueue,
    retryItem:   (id) => { offlineQueue.markPending(id); syncQueue(); },
    discardItem: (id) => { offlineQueue.discard(id); refreshQueue(); },
    borradoresCount,
    isSyncingBorradores,
    lastBorradorSync,
  };
}

// ── Ejecutar un item de la cola en Supabase real ──────────

async function executeItem(item) {
  const { table, operation, data, filters } = item;
  let query = supabaseReal.from(table);

  if      (operation === 'insert') query = query.insert(data);
  else if (operation === 'upsert') query = query.upsert(data);
  else if (operation === 'update') query = applyFilters(query.update(data), filters);
  else if (operation === 'delete') query = applyFilters(query.delete(), filters);
  else throw new Error(`Operación desconocida: ${operation}`);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

function applyFilters(query, filters) {
  for (const [key, val] of Object.entries(filters || {})) {
    const colonIdx = key.indexOf(':');
    const op  = key.slice(0, colonIdx);
    const col = key.slice(colonIdx + 1);
    if      (op === 'eq')  query = query.eq(col, val);
    else if (op === 'neq') query = query.neq(col, val);
    else if (op === 'gt')  query = query.gt(col, val);
    else if (op === 'lt')  query = query.lt(col, val);
    else if (op === 'gte') query = query.gte(col, val);
    else if (op === 'lte') query = query.lte(col, val);
  }
  return query;
}
