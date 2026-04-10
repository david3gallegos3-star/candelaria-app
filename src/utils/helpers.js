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