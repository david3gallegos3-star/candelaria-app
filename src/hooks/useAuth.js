// ============================================
// HOOK DE AUTENTICACIÓN — login, logout, roles
// Usado por: App.js
// ============================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { crearNotificacion } from '../utils/helpers';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [userRol, setUserRol] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const notifTimer = useRef();

  // Carga el rol del usuario desde Supabase
  async function cargarRolUsuario(uid) {
    const { data } = await supabase
      .from('usuarios_roles')
      .select('*')
      .eq('user_id', uid)
      .eq('activo', true)
      .single();
    setUserRol(data);
    return data;
  }

  // Login con email y password
  async function login(onSuccess) {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, password 
    });
    if (error) { 
      alert('Error: ' + error.message); 
      setLoading(false); 
      return; 
    }
    const rol = await cargarRolUsuario(data.user.id);
    setUser(data.user);
    setLoading(false);
    if (!rol) {
      alert('Tu usuario no tiene rol asignado. Contacta al administrador.');
      return;
    }
    if (onSuccess) onSuccess(rol);
  }

  // Logout
  async function logout(onSuccess) {
    await supabase.auth.signOut();
    setUser(null);
    setUserRol(null);
    clearInterval(notifTimer.current);
    if (onSuccess) onSuccess();
  }

  // Sesión activa al recargar página
  async function checkSession(onSuccess) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const rol = await cargarRolUsuario(session.user.id);
      if (onSuccess) onSuccess(rol);
    }
  }

  return {
    user, userRol,
    loading, setLoading,
    email, setEmail,
    password, setPassword,
    notifTimer,
    login, logout,
    checkSession,
    cargarRolUsuario
  };
}