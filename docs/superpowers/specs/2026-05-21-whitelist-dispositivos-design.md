# Whitelist de Dispositivos — Diseño

## Goal

Solo dispositivos aprobados por el admin pueden usar la app. Los administradores están exentos. Los roles y permisos existentes no cambian.

## Architecture

Nueva tabla Supabase `dispositivos_autorizados`. Al abrir la app, cada usuario no-admin es verificado por UUID de dispositivo antes de llegar al login. El admin aprueba/rechaza desde Gestión de Usuarios.

## Tech Stack

React, Supabase (PostgREST + RLS), localStorage para UUID persistente.

---

## Tabla Supabase

```sql
create table dispositivos_autorizados (
  id          uuid primary key default gen_random_uuid(),
  uuid        text not null unique,
  user_id     uuid references auth.users(id),
  estado      text not null default 'pendiente', -- pendiente | aprobado | rechazado
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

RLS: solo admins pueden leer/actualizar todos los registros. Usuarios normales solo pueden leer su propio UUID.

---

## Flujo de verificación (al abrir la app)

1. Leer UUID de `localStorage['candelaria_device_id']`
2. Si no existe → generar UUID con `crypto.randomUUID()` y guardarlo
3. Si el usuario es admin (`rol === 'admin'`) → saltar verificación, continuar normal
4. Consultar `dispositivos_autorizados` donde `uuid = deviceId`
5. **No existe** → insertar con `estado: 'pendiente'` → mostrar pantalla de espera + crear notificación al admin
6. **Pendiente** → mostrar pantalla de espera: *"Solicitud enviada. El administrador debe aprobar este dispositivo."*
7. **Rechazado** → mostrar pantalla de bloqueo: *"Acceso denegado. Contacta al administrador."*
8. **Aprobado** → continuar al login normal

La verificación ocurre después de `checkSession` — si la sesión ya está activa, igual se verifica el dispositivo.

---

## Pantallas de bloqueo

**Pendiente:**
- Ícono de reloj ⏳
- Título: "Dispositivo pendiente de aprobación"
- Mensaje: "Tu solicitud fue enviada al administrador. Espera la aprobación."
- Botón: "Verificar de nuevo" (reconsulta Supabase)

**Rechazado:**
- Ícono 🚫
- Título: "Acceso denegado"
- Mensaje: "Este dispositivo no tiene acceso. Contacta al administrador."
- Sin botón de reintento

---

## Panel en Gestión de Usuarios

Nueva sección debajo de la lista de usuarios, visible solo para admins. Tres pestañas:

- **Pendientes** — muestra UUID corto, usuario vinculado (si ya hizo login), fecha de solicitud. Botones: Aprobar / Rechazar
- **Aprobados** — lista de dispositivos activos. Botón: Revocar
- **Rechazados** — lista. Botón: Aprobar (por si cambia de opinión)

Al aprobar/rechazar se actualiza `estado` en Supabase y se registra `updated_at`.

---

## Notificación al admin

Cuando se registra un dispositivo nuevo (`pendiente`), se llama `crearNotificacion` con:
```js
{
  tipo: 'dispositivo_nuevo',
  origen: 'auth',
  mensaje: 'Nuevo dispositivo solicita acceso'
}
```

---

## Archivos a crear/modificar

- **Crear:** `src/hooks/useDeviceAuth.js` — lógica de UUID + verificación
- **Crear:** `src/components/DispositivoBloqueado.js` — pantallas pendiente/rechazado
- **Modificar:** `src/App.js` — agregar verificación de dispositivo en el flujo de inicio
- **Modificar:** `src/components/GestorUsuarios.js` — agregar panel de dispositivos
- **Supabase:** crear tabla `dispositivos_autorizados` con RLS

---

## Lo que NO cambia

- Roles y permisos existentes (Administrador, Bodeguero, Formulador, Producción)
- Flujo de login con email/contraseña
- Sistema de notificaciones existente
- Cualquier otro módulo de la app
