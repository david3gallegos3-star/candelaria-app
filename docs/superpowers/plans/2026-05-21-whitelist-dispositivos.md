# Whitelist de Dispositivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solo dispositivos aprobados por el admin pueden usar la app — UUID en localStorage, tabla Supabase, admin aprueba/rechaza desde GestorUsuarios.

**Architecture:** Al iniciar la app (checkSession) o hacer login, si el usuario NO es admin, se verifica el UUID del dispositivo contra `dispositivos_autorizados` en Supabase. Si no existe se registra como pendiente y se muestra pantalla de bloqueo; si está aprobado se entra normal. El admin gestiona dispositivos desde una nueva sección en el modal de Gestión de Usuarios.

**Tech Stack:** React, Supabase (PostgREST + RLS), localStorage para UUID persistente.

---

## Archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear | `src/hooks/useDeviceAuth.js` | UUID get/create + query/insert Supabase |
| Crear | `src/components/DispositivoBloqueado.js` | Pantallas pendiente / rechazado |
| Modificar | `src/hooks/useAuth.js` | Pasar `(user, rol)` a callbacks onSuccess |
| Modificar | `src/App.js` | Integrar verificación entre auth y navegación |
| Modificar | `src/components/GestorUsuarios.js` | Panel de dispositivos con tabs |
| Manual | Supabase dashboard | Crear tabla + RLS |

---

## Task 1: Crear tabla Supabase `dispositivos_autorizados`

**Files:**
- Manual: Supabase SQL editor

- [ ] **Step 1: Ejecutar el SQL en Supabase dashboard → SQL Editor**

```sql
-- Tabla
create table if not exists dispositivos_autorizados (
  id         uuid primary key default gen_random_uuid(),
  uuid       text not null unique,
  user_id    uuid references auth.users(id),
  estado     text not null default 'pendiente',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table dispositivos_autorizados enable row level security;

-- Cualquier usuario autenticado puede leer todos los registros
-- (el UUID es secreto y la app solo consulta el propio)
create policy "auth_select"
  on dispositivos_autorizados for select
  to authenticated
  using (true);

-- Usuario autenticado puede insertar su propio dispositivo
create policy "auth_insert"
  on dispositivos_autorizados for insert
  to authenticated
  with check (user_id = auth.uid());

-- Solo admin puede actualizar estado
create policy "admin_update"
  on dispositivos_autorizados for update
  to authenticated
  using (
    exists (
      select 1 from usuarios_roles
      where user_id = auth.uid() and rol = 'admin' and activo = true
    )
  );

-- Solo admin puede eliminar registros
create policy "admin_delete"
  on dispositivos_autorizados for delete
  to authenticated
  using (
    exists (
      select 1 from usuarios_roles
      where user_id = auth.uid() and rol = 'admin' and activo = true
    )
  );
```

- [ ] **Step 2: Verificar que la tabla existe**

En Supabase → Table Editor, confirmar que aparece `dispositivos_autorizados` con columnas: `id`, `uuid`, `user_id`, `estado`, `created_at`, `updated_at`.

---

## Task 2: `src/hooks/useDeviceAuth.js` — UUID + verificación

**Files:**
- Create: `src/hooks/useDeviceAuth.js`

- [ ] **Step 1: Crear el archivo**

```js
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
```

- [ ] **Step 2: Verificar manualmente**

Abrir DevTools → Application → Local Storage. Confirmar que después del primer login no-admin aparece `candelaria_device_id` con un UUID.

En Supabase → Table Editor → `dispositivos_autorizados`, confirmar que hay un registro con ese UUID y `estado = 'pendiente'`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDeviceAuth.js
git commit -m "feat: hook verificarDispositivo con UUID localStorage + Supabase"
```

---

## Task 3: `src/components/DispositivoBloqueado.js` — pantallas de bloqueo

**Files:**
- Create: `src/components/DispositivoBloqueado.js`

- [ ] **Step 1: Crear el componente**

```js
import React from 'react';

export default function DispositivoBloqueado({ estado, onReverificar }) {
  const esPendiente = estado === 'pendiente';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0d1b2a,#1a2a3a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${esPendiente ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'}`,
        borderRadius: '16px',
        padding: '48px 36px',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
      }}>
        <div style={{ fontSize: '56px', marginBottom: '20px' }}>
          {esPendiente ? '⏳' : '🚫'}
        </div>

        <div style={{
          color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px',
        }}>
          {esPendiente ? 'Dispositivo pendiente de aprobación' : 'Acceso denegado'}
        </div>

        <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.6', marginBottom: '28px' }}>
          {esPendiente
            ? 'Tu solicitud fue enviada al administrador. Espera la aprobación.'
            : 'Este dispositivo no tiene acceso. Contacta al administrador.'}
        </div>

        {esPendiente && (
          <button
            onClick={onReverificar}
            style={{
              background: 'rgba(59,130,246,0.2)',
              border: '1.5px solid rgba(59,130,246,0.5)',
              color: '#60a5fa',
              borderRadius: '10px',
              padding: '10px 24px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            Verificar de nuevo
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DispositivoBloqueado.js
git commit -m "feat: componente DispositivoBloqueado pantallas pendiente/rechazado"
```

---

## Task 4: Modificar `src/hooks/useAuth.js` — pasar (user, rol) a onSuccess

**Files:**
- Modify: `src/hooks/useAuth.js`

El callback `onSuccess` actualmente no recibe parámetros. Necesitamos que reciba `(user, rol)` para que App.js pueda llamar `verificarDispositivo` con los datos correctos justo después de autenticar.

- [ ] **Step 1: Modificar `login` — pasar (user, rol) a onSuccess**

Localizar en `src/hooks/useAuth.js` la línea:
```js
    if (onSuccess) onSuccess();
```
dentro de `login` (justo después de `setLoading(false)` y del bloque de notificación) y cambiarla a:
```js
    if (onSuccess) onSuccess(data.user, rol);
```

El bloque completo de `login` después del cambio:
```js
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
    if (data.user.email !== 'davidbi.br@gmail.com') {
      const nombre = rol?.nombre || data.user.email;
      crearNotificacion({
        tipo:           'login_usuario',
        origen:         'auth',
        usuario_nombre: nombre,
        user_id:        data.user.id,
        mensaje:        `${nombre} ingresó al sistema`,
      });
    }
    if (onSuccess) onSuccess(data.user, rol);
  }
```

- [ ] **Step 2: Modificar `checkSession` — pasar (session.user, rol) a onSuccess**

Localizar en `checkSession` la línea:
```js
      if (onSuccess) onSuccess();
```
y cambiarla a:
```js
      if (onSuccess) onSuccess(session.user, rol);
```

El bloque completo de `checkSession` después del cambio:
```js
  async function checkSession(onSuccess) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const rol = await cargarRolUsuario(session.user.id);
      if (session.user.email !== 'davidbi.br@gmail.com') {
        const nombre = rol?.nombre || session.user.email;
        crearNotificacion({
          tipo:           'login_usuario',
          origen:         'auth',
          usuario_nombre: nombre,
          user_id:        session.user.id,
          mensaje:        `${nombre} ingresó al sistema`,
        });
      }
      if (onSuccess) onSuccess(session.user, rol);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAuth.js
git commit -m "feat: pasar (user, rol) a callbacks onSuccess en useAuth"
```

---

## Task 5: Integrar verificación de dispositivo en `src/App.js`

**Files:**
- Modify: `src/App.js`

- [ ] **Step 1: Agregar import de `verificarDispositivo` y `DispositivoBloqueado`**

Agregar debajo de la línea `import { useAuth } from './hooks/useAuth';`:
```js
import { verificarDispositivo } from './hooks/useDeviceAuth';
import DispositivoBloqueado      from './components/DispositivoBloqueado';
```

- [ ] **Step 2: Agregar estado `dispositivoEstado` en el componente App**

Agregar en la sección de estados (junto a los otros `useState`), después de `const [modalUsuarios, setModalUsuarios] = useState(false);`:
```js
const [dispositivoEstado, setDispositivoEstado] = useState(null);
const [dispositivoUser,   setDispositivoUser]   = useState(null);
const [dispositivoRol,    setDispositivoRol]    = useState(null);
```

- [ ] **Step 3: Reemplazar el `useEffect` de `checkSession`**

Localizar:
```js
  useEffect(() => {
    checkSession(async () => {
      await cargarTodo();
      setPantalla('menuPrincipal');
    });
  }, []);
```

Reemplazar por:
```js
  useEffect(() => {
    checkSession(async (authUser, authRol) => {
      const estado = await verificarDispositivo(authUser.id, authRol?.rol);
      if (estado === 'aprobado') {
        await cargarTodo();
        setPantalla('menuPrincipal');
      } else {
        setDispositivoUser(authUser);
        setDispositivoRol(authRol);
        setDispositivoEstado(estado);
      }
    });
  }, []);
```

- [ ] **Step 4: Reemplazar el callback de `login` en el render**

Localizar:
```js
      login={() => login(async () => {
        await cargarTodo();
        setPantalla('menuPrincipal');
      })}
```

Reemplazar por:
```js
      login={() => login(async (authUser, authRol) => {
        const estado = await verificarDispositivo(authUser.id, authRol?.rol);
        if (estado === 'aprobado') {
          await cargarTodo();
          setPantalla('menuPrincipal');
        } else {
          setDispositivoUser(authUser);
          setDispositivoRol(authRol);
          setDispositivoEstado(estado);
        }
      })}
```

- [ ] **Step 5: Agregar render de `DispositivoBloqueado` ANTES del bloque `if (pantalla === 'login')`**

Localizar la línea:
```js
  if (pantalla === 'login') return (
```

Agregar justo antes:
```js
  if (dispositivoEstado === 'pendiente' || dispositivoEstado === 'rechazado') {
    return (
      <DispositivoBloqueado
        estado={dispositivoEstado}
        onReverificar={async () => {
          const estado = await verificarDispositivo(dispositivoUser.id, dispositivoRol?.rol);
          if (estado === 'aprobado') {
            setDispositivoEstado(null);
            await cargarTodo();
            setPantalla('menuPrincipal');
          } else {
            setDispositivoEstado(estado);
          }
        }}
      />
    );
  }

```

- [ ] **Step 6: Verificación manual**

1. Abrir la app como usuario no-admin (en una sesión sin `candelaria_device_id` en localStorage).
2. Hacer login → debe aparecer la pantalla "Dispositivo pendiente de aprobación" con botón "Verificar de nuevo".
3. El botón "Verificar de nuevo" reconsulta Supabase y muestra el estado actualizado.
4. Hacer login como admin (`davidbi.br@gmail.com`) → debe entrar directo al menú principal.

- [ ] **Step 7: Commit**

```bash
git add src/App.js
git commit -m "feat: integrar verificacion de dispositivo en flujo de inicio"
```

---

## Task 6: Panel de dispositivos en `src/components/GestorUsuarios.js`

**Files:**
- Modify: `src/components/GestorUsuarios.js`

Nueva sección al final del modal, debajo de la lista de usuarios. Solo visible para admins. Tiene 3 pestañas: Pendientes / Aprobados / Rechazados.

- [ ] **Step 1: Agregar imports de `useState` y `useEffect`**

Localizar:
```js
import React from 'react';
```

Reemplazar por:
```js
import React, { useState, useEffect } from 'react';
```

- [ ] **Step 2: Agregar estado y funciones de dispositivos dentro de `GestorUsuarios`**

Localizar dentro del componente la línea:
```js
  if (!modalUsuarios) return null;
```

Agregar ANTES de esa línea:
```js
  const [tabDispositivos,  setTabDispositivos]  = useState('pendientes');
  const [dispositivos,     setDispositivos]     = useState([]);
  const [cargandoDispositivos, setCargandoDispositivos] = useState(false);

  async function cargarDispositivos() {
    setCargandoDispositivos(true);
    const { data } = await supabase
      .from('dispositivos_autorizados')
      .select('*')
      .order('created_at', { ascending: false });
    setDispositivos(data || []);
    setCargandoDispositivos(false);
  }

  async function aprobarDispositivo(id) {
    await supabase.from('dispositivos_autorizados')
      .update({ estado: 'aprobado', updated_at: new Date().toISOString() })
      .eq('id', id);
    await cargarDispositivos();
    mostrarExito('✅ Dispositivo aprobado');
  }

  async function rechazarDispositivo(id) {
    await supabase.from('dispositivos_autorizados')
      .update({ estado: 'rechazado', updated_at: new Date().toISOString() })
      .eq('id', id);
    await cargarDispositivos();
    mostrarExito('Dispositivo rechazado');
  }

  async function revocarDispositivo(id) {
    await supabase.from('dispositivos_autorizados')
      .update({ estado: 'rechazado', updated_at: new Date().toISOString() })
      .eq('id', id);
    await cargarDispositivos();
    mostrarExito('Dispositivo revocado');
  }

  useEffect(() => {
    if (modalUsuarios) cargarDispositivos();
  }, [modalUsuarios]);

```

- [ ] **Step 3: Agregar la sección de dispositivos en el JSX**

El modal actualmente termina con `</div></div>` (cierre del scroll container y del modal). Localizar el cierre del scroll container justo antes del cierre del modal.

La estructura final del modal es:
```jsx
        {/* Lista usuarios existente — NO modificar */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {/* ... lista de usuarios ... */}
        </div>

        {/* ─── NUEVA SECCIÓN DISPOSITIVOS ─────────────────── */}
        <div style={{
          borderTop: '1px solid #e5e7eb',
          padding: '16px 20px',
          background: '#f8fafc',
        }}>
          <div style={{
            fontWeight: 'bold', fontSize: '13px', color: '#1a1a2e',
            marginBottom: '12px',
          }}>
            💻 Dispositivos autorizados
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['pendientes', 'aprobados', 'rechazados'].map(tab => (
              <button key={tab} onClick={() => setTabDispositivos(tab)} style={{
                padding: '4px 14px', borderRadius: '20px', fontSize: '12px',
                fontWeight: 'bold', cursor: 'pointer', border: 'none',
                background: tabDispositivos === tab
                  ? (tab === 'pendientes' ? '#f59e0b' : tab === 'aprobados' ? '#22c55e' : '#ef4444')
                  : '#e5e7eb',
                color: tabDispositivos === tab ? (tab === 'pendientes' ? '#000' : '#fff') : '#555',
              }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Lista de dispositivos */}
          {cargandoDispositivos ? (
            <div style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '8px' }}>
              Cargando...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
              {dispositivos
                .filter(d => d.estado === tabDispositivos.slice(0, -1))
                .map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'white', borderRadius: '8px', padding: '8px 12px',
                    border: '1px solid #e5e7eb', fontSize: '12px',
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>
                        {d.uuid.slice(0, 8)}...{d.uuid.slice(-4)}
                      </span>
                      <span style={{ color: '#888', marginLeft: '10px' }}>
                        {new Date(d.created_at).toLocaleDateString('es-EC')}
                      </span>
                    </div>
                    {d.estado === 'pendiente' && (
                      <>
                        <button onClick={() => aprobarDispositivo(d.id)} style={{
                          background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                          color: '#16a34a', borderRadius: '6px', padding: '3px 10px',
                          cursor: 'pointer', fontSize: '11px', fontWeight: 'bold',
                        }}>Aprobar</button>
                        <button onClick={() => rechazarDispositivo(d.id)} style={{
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                          color: '#dc2626', borderRadius: '6px', padding: '3px 10px',
                          cursor: 'pointer', fontSize: '11px',
                        }}>Rechazar</button>
                      </>
                    )}
                    {d.estado === 'aprobado' && (
                      <button onClick={() => revocarDispositivo(d.id)} style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                        color: '#dc2626', borderRadius: '6px', padding: '3px 10px',
                        cursor: 'pointer', fontSize: '11px',
                      }}>Revocar</button>
                    )}
                    {d.estado === 'rechazado' && (
                      <button onClick={() => aprobarDispositivo(d.id)} style={{
                        background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                        color: '#16a34a', borderRadius: '6px', padding: '3px 10px',
                        cursor: 'pointer', fontSize: '11px', fontWeight: 'bold',
                      }}>Aprobar</button>
                    )}
                  </div>
                ))}
              {dispositivos.filter(d => d.estado === tabDispositivos.slice(0, -1)).length === 0 && (
                <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '12px' }}>
                  Sin dispositivos {tabDispositivos}
                </div>
              )}
            </div>
          )}
        </div>
        {/* ─── FIN SECCIÓN DISPOSITIVOS ───────────────────── */}
```

Para insertar correctamente esta sección, localizar el cierre del scroll container de usuarios. En el JSX actual del modal, justo antes del último `</div></div>` que cierra el modal (el `div` con `background:'white', borderRadius:'14px'`), insertar el bloque de sección dispositivos.

- [ ] **Step 4: Verificación manual**

1. Iniciar sesión como admin.
2. Abrir Gestión de Usuarios.
3. Confirmar que aparece la sección "💻 Dispositivos autorizados" con tabs Pendientes / Aprobados / Rechazados.
4. Con un dispositivo pendiente en la tabla: hacer clic en "Aprobar" → confirmar que el estado cambia en Supabase.
5. En el dispositivo aprobado: tab "Aprobados" → botón "Revocar" → confirmar que pasa a rechazado.

- [ ] **Step 5: Commit**

```bash
git add src/components/GestorUsuarios.js
git commit -m "feat: panel de dispositivos autorizados en GestorUsuarios"
```

---

## Task 7: Push y deploy

- [ ] **Step 1: Verificar que no hay errores en la app**

```bash
npm run build
```

Expected: sin errores de compilación.

- [ ] **Step 2: Push a main → dispara deploy en Vercel**

```bash
git push origin main
```

- [ ] **Step 3: Confirmar deploy en Vercel dashboard**

Verificar que el build pasa y la app está activa en producción.
