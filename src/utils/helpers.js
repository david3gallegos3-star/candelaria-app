// ============================================
// HELPERS GLOBALES — registrarAuditoria, crearNotificacion, norm
// Usado por: App.js, Inventario.js, Produccion.js, etc.
// ============================================

import { supabase } from '../supabase';

// Normaliza texto — quita tildes, minúsculas, espacios
export function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Registra un evento en la tabla auditoria
export async function registrarAuditoria({ 
  tipo, usuario_nombre, user_id, producto_nombre, 
  campo_modificado, valor_antes, valor_despues, mensaje 
}) {
  try {
    await supabase.from('auditoria').insert([{
      tipo,
      usuario_nombre,
      user_id: user_id || null,
      producto_nombre: producto_nombre || null,
      campo_modificado: campo_modificado || null,
      valor_antes: valor_antes ? String(valor_antes) : null,
      valor_despues: valor_despues ? String(valor_despues) : null,
      mensaje: mensaje || null,
      leida: false
    }]);
  } catch(e) { 
    console.error('Error auditoría:', e); 
  }
}

// Crea una notificación y registra en auditoría
export async function crearNotificacion({ 
  tipo, origen, usuario_nombre, user_id, 
  producto_nombre, mensaje 
}) {
  try {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('notificaciones').insert([{
      tipo,
      origen,
      usuario_nombre,
      user_id: user_id || null,
      producto_nombre: producto_nombre || null,
      mensaje,
      leida: false,
      expires_at: expires
    }]).select().single();

    await registrarAuditoria({ 
      tipo, usuario_nombre, user_id, 
      producto_nombre, mensaje 
    });

    return data;
  } catch(e) {
    console.error('Error notificación:', e);
  }
}

export async function checkRecordatoriosFactura() {
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: compras } = await supabase
      .from('compras')
      .select('id, proveedor_nombre, fecha, ultima_notif_factura')
      .eq('tiene_factura', true)
      .is('numero_factura', null)
      .eq('recordar_factura', true);

    if (!compras || compras.length === 0) return;

    for (const c of compras) {
      const debeNotificar = !c.ultima_notif_factura ||
        new Date(c.ultima_notif_factura) < new Date(hace24h);

      if (!debeNotificar) continue;

      await supabase.from('notificaciones').insert({
        tipo:    'recordatorio_factura',
        origen:  'compras',
        mensaje: `🔔 Pendiente N° factura — ${c.proveedor_nombre || 'Proveedor'} (compra del ${c.fecha})`,
        leida:   false
      });

      await supabase.from('compras')
        .update({ ultima_notif_factura: new Date().toISOString() })
        .eq('id', c.id);
    }
  } catch(e) {
    console.error('Error recordatorios factura:', e);
  }
}