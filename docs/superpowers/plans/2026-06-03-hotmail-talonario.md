# Hotmail → Talonario: Integración Completa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar Hotmail via Microsoft Graph API para leer estados de cuenta bancarios automáticamente, extraer datos con Claude AI y cargarlos al Talonario (saldo corriente + cargos tarjeta + pagos banco).

**Architecture:** OAuth 2.0 con cuentas personales Microsoft (`consumers` endpoint). Tokens guardados en Supabase. Edge Function lee emails del Graph API + Claude extrae datos. UI en Talonario nueva pestaña HOTMAIL. Deduplicación por banco+cuenta+período. Cron semanal en Vercel.

**Tech Stack:** React, Supabase (Edge Functions + tabla ms_tokens + bank_statements), Microsoft Graph API, Claude API (claude-haiku-4-5), Vercel Serverless + Cron

---

## Credenciales disponibles (ya en Vercel)

- `MICROSOFT_CLIENT_ID` = `1fd67b97-2588-4bb0-b8ab-984ec271e499`
- `MICROSOFT_TENANT_ID` = `2d9433aa-8fc1-45a0-8903-c80d1758f2e0`
- `MICROSOFT_CLIENT_SECRET` = (ver Vercel env vars)
- Redirect URI: `https://candelaria-app.vercel.app/api/auth/callback`

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| Supabase SQL | Crear | Tablas `ms_tokens` y `bank_statements` |
| Vercel env vars | Manual | Agregar `SUPABASE_SERVICE_KEY` y `REACT_APP_SUPABASE_URL` |
| `api/auth/microsoft.js` | Crear | Inicia OAuth con Microsoft |
| `api/auth/callback.js` | Crear | Recibe code → intercambia tokens → guarda en Supabase |
| `api/cron/sync-emails.js` | Crear | Cron semanal — sincroniza todos los usuarios conectados |
| `vercel.json` | Crear | Configura cron schedule |
| `supabase/functions/leer-emails-banco/index.ts` | Crear | Lee emails Graph API + Claude extrae datos |
| `supabase/functions/cargar-estado-cuenta/index.ts` | Crear | Carga estado confirmado al Talonario |
| `src/components/contabilidad/talonario/hotmail/HotmailSync.js` | Crear | UI: conectar, sincronizar, vista previa, cargar |
| `src/components/contabilidad/talonario/TabTalonario.js` | Modificar | Agregar pestaña 📧 HOTMAIL |

---

## Task 1: SQL — Tablas ms_tokens y bank_statements

**Files:**
- Ejecutar en: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Crear las 2 tablas**

```sql
-- Tokens OAuth de Microsoft por usuario
CREATE TABLE IF NOT EXISTS ms_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Estados de cuenta procesados por la IA
CREATE TABLE IF NOT EXISTS bank_statements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ms_email_id  text NOT NULL,
  banco        text NOT NULL,
  tipo_cuenta  text NOT NULL,        -- 'corriente' | 'ahorros' | 'tarjeta_credito'
  red_tarjeta  text,                 -- 'Visa' | 'Mastercard' | 'Diners' | 'American Express'
  ultimos4     text,
  periodo_mes  integer NOT NULL,
  periodo_año  integer NOT NULL,
  saldo        numeric(12,2),
  datos_json   jsonb,               -- detalle completo: cargos, fechas, cuotas
  estado       text DEFAULT 'procesado', -- 'procesado' | 'cargado'
  created_at   timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE ms_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_tokens" ON ms_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_statements" ON bank_statements
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Verificar en Table Editor**

Confirmar que aparecen `ms_tokens` y `bank_statements` con sus columnas.

---

## Task 2: Variables de entorno en Vercel (manual)

**Files:**
- Vercel Dashboard → candelaria-app → Settings → Environment Variables

- [ ] **Step 1: Agregar SUPABASE_SERVICE_KEY**

En Supabase → Project Settings → API → copiar **service_role key** (no la anon key).

En Vercel agregar:
- Nombre: `SUPABASE_SERVICE_KEY`
- Valor: (el service_role key copiado)
- Environments: Production, Preview

- [ ] **Step 2: Verificar REACT_APP_SUPABASE_URL**

Confirmar que ya existe `REACT_APP_SUPABASE_URL` en Vercel. Si no existe, agregarlo con el valor de Supabase → Project Settings → API → Project URL.

---

## Task 3: api/auth/microsoft.js — Inicia OAuth

**Files:**
- Create: `api/auth/microsoft.js`

- [ ] **Step 1: Crear el handler**

```javascript
// api/auth/microsoft.js
// Redirige al login de Microsoft para autorizar lectura de emails

module.exports = function handler(req, res) {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  'https://candelaria-app.vercel.app/api/auth/callback',
    scope:         'offline_access Mail.Read User.Read',
    response_mode: 'query',
    state:         userId,
  });

  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`;
  res.redirect(302, authUrl);
};
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/microsoft.js
git commit -m "feat(hotmail): API route inicia OAuth con Microsoft"
```

---

## Task 4: api/auth/callback.js — Recibe tokens

**Files:**
- Create: `api/auth/callback.js`

- [ ] **Step 1: Crear el handler**

```javascript
// api/auth/callback.js
// Intercambia el authorization code por tokens y los guarda en Supabase

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const { code, state: userId, error: msError } = req.query;

  if (msError || !code) {
    return res.redirect(302, `https://candelaria-app.vercel.app?hotmail_error=${msError || 'sin_codigo'}`);
  }

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri:  'https://candelaria-app.vercel.app/api/auth/callback',
        grant_type:    'authorization_code',
        scope:         'offline_access Mail.Read User.Read',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // 2. Obtener email del usuario desde Graph API
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.mail || profile.userPrincipalName || 'desconocido';

    // 3. Guardar en Supabase usando service key (bypasa RLS para operación de servidor)
    const supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    const { error: dbErr } = await supabase.from('ms_tokens').upsert({
      user_id:       userId,
      email,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (dbErr) throw new Error(dbErr.message);

    res.redirect(302, 'https://candelaria-app.vercel.app?hotmail=conectado');
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect(302, `https://candelaria-app.vercel.app?hotmail_error=${encodeURIComponent(e.message)}`);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/callback.js
git commit -m "feat(hotmail): OAuth callback — intercambia código por tokens y guarda en Supabase"
```

---

## Task 5: Edge Function leer-emails-banco

**Files:**
- Create: `supabase/functions/leer-emails-banco/index.ts`

Esta función:
1. Obtiene y refresca el token Microsoft del usuario
2. Busca emails de los últimos 45 días con palabras clave bancarias
3. Para cada email nuevo: Claude extrae los datos del estado de cuenta
4. Guarda en `bank_statements` con estado='procesado'
5. Retorna todos los estados pendientes de carga

- [ ] **Step 1: Crear la Edge Function**

```typescript
// supabase/functions/leer-emails-banco/index.ts
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BANK_KEYWORDS = [
  'estado de cuenta', 'estado bancario', 'resumen de cuenta',
  'tu factura', 'resumen mensual', 'extracto', 'estado de tarjeta',
  'corte de cuenta', 'estado financiero',
];

const EXTRACTION_PROMPT = `Eres un experto en estados de cuenta bancarios de Ecuador (Banco Pichincha, Produbanco, Banco Guayaquil, Banco del Pacífico, Banco Internacional, Banco Bolivariano, Diners Club, etc.).

Analiza este contenido de email/estado de cuenta y extrae los datos en JSON estricto.

Reglas:
- periodo_mes y periodo_año se refieren al MES DEL ESTADO, no la fecha de envío del email
- saldo: para cuentas corrientes/ahorros es el saldo disponible; para tarjetas es el saldo pendiente a pagar
- Para cuotas: cuota_actual=3, cuota_total=12 significa "cuota 3 de 12"
- Si no puedes identificar un campo con certeza, usa null

Responde SOLO con este JSON (sin markdown, sin texto adicional):
{
  "es_estado_cuenta": true,
  "banco": "nombre exacto del banco o emisor",
  "tipo_cuenta": "corriente" | "ahorros" | "tarjeta_credito",
  "red_tarjeta": "Visa" | "Mastercard" | "Diners" | "American Express" | null,
  "ultimos4": "últimos 4 dígitos de la cuenta/tarjeta o null",
  "periodo_mes": número 1-12,
  "periodo_año": número ej 2026,
  "saldo": número o null,
  "fecha_corte": "DD/MM/YYYY" o null,
  "fecha_pago": "DD/MM/YYYY" o null,
  "cargos": [
    {
      "fecha": "DD/MM/YYYY",
      "descripcion": "descripción del cargo",
      "monto": número,
      "cuota_actual": número o null,
      "cuota_total": número o null
    }
  ]
}

Si no es un estado de cuenta bancario, responde: {"es_estado_cuenta": false}`;

async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data: token } = await supabase
    .from('ms_tokens').select('*').eq('user_id', userId).single();
  if (!token) return null;

  // Si el token no ha expirado (con margen de 5 min), usarlo directo
  if (new Date(token.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return token.access_token;
  }

  // Refrescar el token
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
      scope:         'offline_access Mail.Read User.Read',
    }),
  });

  const newTokens = await res.json();
  if (newTokens.error) return null;

  const expiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString();
  await supabase.from('ms_tokens').update({
    access_token:  newTokens.access_token,
    refresh_token: newTokens.refresh_token || token.refresh_token,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  }).eq('user_id', userId);

  return newTokens.access_token;
}

async function extractWithClaude(content: string, isPdf: boolean, pdfBase64?: string): Promise<any> {
  let messages: any[];

  if (isPdf && pdfBase64) {
    messages = [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }];
  } else {
    messages = [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nContenido del email:\n${content.slice(0, 8000)}`,
    }];
  }

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages,
  });

  const texto = resp.content[0].text.trim();
  return JSON.parse(texto);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error('userId requerido');

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'no_token', message: 'Hotmail no conectado' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Buscar emails de los últimos 45 días con palabras clave bancarias
    const desde = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const keywordFilter = BANK_KEYWORDS
      .map(k => `contains(subject,'${k}')`)
      .join(' or ');

    const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?` +
      `$filter=receivedDateTime ge ${desde} and (${keywordFilter})` +
      `&$top=30&$select=id,subject,receivedDateTime,body,hasAttachments` +
      `&$orderby=receivedDateTime desc`;

    const emailsRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const emailsData = await emailsRes.json();
    const emails = emailsData.value || [];

    // Obtener IDs de emails ya procesados para este usuario
    const { data: existing } = await supabase
      .from('bank_statements')
      .select('ms_email_id, banco, ultimos4, periodo_mes, periodo_año, estado')
      .eq('user_id', userId);

    const processedEmailIds = new Set((existing || []).map((s: any) => s.ms_email_id));
    const loadedKeys = new Set(
      (existing || [])
        .filter((s: any) => s.estado === 'cargado')
        .map((s: any) => `${s.banco}_${s.ultimos4}_${s.periodo_mes}_${s.periodo_año}`)
    );

    const nuevos: any[] = [];
    const pendientes: any[] = [];

    for (const email of emails) {
      // Si ya fue procesado como estado='procesado' (pendiente de carga), retornar directamente
      if (processedEmailIds.has(email.id)) {
        const stmt = (existing || []).find((s: any) => s.ms_email_id === email.id);
        if (stmt && stmt.estado === 'procesado') {
          const { data: fullStmt } = await supabase
            .from('bank_statements').select('*').eq('ms_email_id', email.id).eq('user_id', userId).single();
          if (fullStmt) pendientes.push(fullStmt);
        }
        continue;
      }

      // Email nuevo: procesar con Claude
      let extracted: any = null;
      try {
        // Intentar primero con el cuerpo del email
        const bodyContent = email.body?.content || '';
        extracted = await extractWithClaude(bodyContent, false);

        // Si no hay suficiente info y hay adjunto PDF, intentar con el PDF
        if (extracted?.es_estado_cuenta && !extracted.saldo && email.hasAttachments) {
          const attachRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const attachData = await attachRes.json();
          const pdf = (attachData.value || []).find((a: any) =>
            a.contentType === 'application/pdf' || a.name?.endsWith('.pdf')
          );
          if (pdf?.contentBytes) {
            extracted = await extractWithClaude('', true, pdf.contentBytes);
          }
        }
      } catch (e) {
        console.error('Error extracting email', email.id, e);
        continue;
      }

      if (!extracted?.es_estado_cuenta) continue;

      // Verificar si ya está CARGADO al Talonario (por banco+cuenta+periodo)
      const dupKey = `${extracted.banco}_${extracted.ultimos4}_${extracted.periodo_mes}_${extracted.periodo_año}`;
      if (loadedKeys.has(dupKey)) continue;

      // Guardar en bank_statements
      const { data: saved } = await supabase.from('bank_statements').insert({
        user_id:     userId,
        ms_email_id: email.id,
        banco:       extracted.banco,
        tipo_cuenta: extracted.tipo_cuenta,
        red_tarjeta: extracted.red_tarjeta,
        ultimos4:    extracted.ultimos4,
        periodo_mes: extracted.periodo_mes,
        periodo_año: extracted.periodo_año,
        saldo:       extracted.saldo,
        datos_json:  extracted,
        estado:      'procesado',
      }).select().single();

      if (saved) nuevos.push(saved);
    }

    const todos = [...nuevos, ...pendientes];

    return new Response(JSON.stringify({
      total: todos.length,
      nuevos: nuevos.length,
      pendientes: pendientes.length,
      statements: todos,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 2: Agregar variables de entorno en Supabase Dashboard**

En Supabase → Edge Functions → Manage secrets, agregar:
- `MICROSOFT_CLIENT_ID` = `1fd67b97-2588-4bb0-b8ab-984ec271e499`
- `MICROSOFT_CLIENT_SECRET` = (ver Vercel env vars)
- `ANTHROPIC_API_KEY` = (el valor de tu cuenta Anthropic)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/leer-emails-banco/index.ts
git commit -m "feat(hotmail): Edge Function leer-emails-banco — Graph API + Claude extracción"
```

---

## Task 6: Edge Function cargar-estado-cuenta

**Files:**
- Create: `supabase/functions/cargar-estado-cuenta/index.ts`

Esta función toma un `bank_statement` confirmado y lo carga a las tablas del Talonario.

- [ ] **Step 1: Crear la Edge Function**

```typescript
// supabase/functions/cargar-estado-cuenta/index.ts
import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { statementId, userId } = await req.json();

    const { data: stmt, error: stmtErr } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('id', statementId)
      .eq('user_id', userId)
      .single();

    if (stmtErr || !stmt) throw new Error('Estado de cuenta no encontrado');
    if (stmt.estado === 'cargado') throw new Error('Ya fue cargado al Talonario');

    const mes = stmt.periodo_mes;
    const año = stmt.periodo_año;
    const datos = stmt.datos_json || {};

    if (stmt.tipo_cuenta === 'corriente' || stmt.tipo_cuenta === 'ahorros') {
      // Guardar saldo en config_contabilidad
      await supabase.from('config_contabilidad').upsert(
        { clave: `saldo_banco_${año}_${mes}`, valor: { saldo: String(stmt.saldo || 0) } },
        { onConflict: 'clave' }
      );
    }

    if (stmt.tipo_cuenta === 'tarjeta_credito') {
      // Guardar cargos en talonario_pagos_personales
      const cargos = datos.cargos || [];
      if (cargos.length > 0) {
        const rows = cargos.map((c: any) => ({
          mes, año,
          fecha:        c.fecha ? c.fecha.split('/').reverse().join('-') : null,
          beneficiario: stmt.banco,
          concepto:     c.cuota_actual
            ? `${c.descripcion} (Cuota ${c.cuota_actual}/${c.cuota_total})`
            : c.descripcion,
          monto:        parseFloat(c.monto) || 0,
          categoria:    'tarjetas',
          forma_pago:   '19',
          comentario:   `${stmt.banco} ${stmt.red_tarjeta || ''} ****${stmt.ultimos4 || ''}`.trim(),
        }));
        await supabase.from('talonario_pagos_personales').insert(rows);
      }
    }

    // Marcar como cargado
    await supabase.from('bank_statements')
      .update({ estado: 'cargado' })
      .eq('id', statementId);

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/cargar-estado-cuenta/index.ts
git commit -m "feat(hotmail): Edge Function cargar-estado-cuenta al Talonario"
```

---

## Task 7: vercel.json + api/cron/sync-emails.js

**Files:**
- Create: `vercel.json`
- Create: `api/cron/sync-emails.js`

- [ ] **Step 1: Crear vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-emails",
      "schedule": "0 8 */7 * *"
    }
  ]
}
```

- [ ] **Step 2: Crear api/cron/sync-emails.js**

```javascript
// api/cron/sync-emails.js
// Cron semanal — sincroniza emails bancarios de todos los usuarios conectados

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // Vercel verifica que sea llamada legítima del cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: tokens } = await supabase
    .from('ms_tokens').select('user_id');

  if (!tokens?.length) return res.json({ synced: 0 });

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseAnon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  let synced = 0;

  for (const { user_id } of tokens) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/leer-emails-banco`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnon,
          'Authorization': `Bearer ${supabaseAnon}`,
        },
        body: JSON.stringify({ userId: user_id }),
      });
      synced++;
    } catch (e) {
      console.error('Error syncing user', user_id, e.message);
    }
  }

  return res.json({ synced, total: tokens.length });
};
```

- [ ] **Step 3: Agregar CRON_SECRET y REACT_APP_SUPABASE_ANON_KEY en Vercel**

En Vercel → Settings → Environment Variables agregar:
- `CRON_SECRET` = cualquier string aleatorio seguro (ej: genera uno con: `openssl rand -hex 32`)
- `REACT_APP_SUPABASE_ANON_KEY` = la anon key de Supabase (si no existe ya)

- [ ] **Step 4: Commit**

```bash
git add vercel.json api/cron/sync-emails.js
git commit -m "feat(hotmail): cron semanal sync emails bancarios"
```

---

## Task 8: HotmailSync.js — Componente UI

**Files:**
- Create: `src/components/contabilidad/talonario/hotmail/HotmailSync.js`

- [ ] **Step 1: Crear el componente**

```javascript
// src/components/contabilidad/talonario/hotmail/HotmailSync.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';

function TarjetaEstado({ stmt, onCargar, cargando }) {
  const d = stmt.datos_json || {};
  const esTarjeta = stmt.tipo_cuenta === 'tarjeta_credito';

  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 12,
      border: stmt.estado === 'cargado' ? '2px solid #27ae60' : '2px solid #e8f4fd',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a2a4a' }}>
            {esTarjeta ? '💳' : '🏦'} {stmt.banco}
            {stmt.red_tarjeta && ` — ${stmt.red_tarjeta}`}
            {stmt.ultimos4 && ` ****${stmt.ultimos4}`}
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            {stmt.tipo_cuenta === 'corriente' ? 'Cuenta corriente' :
             stmt.tipo_cuenta === 'ahorros'   ? 'Cuenta de ahorros' : 'Tarjeta de crédito'}
            {' · '}{['Enero','Febrero','Marzo','Abril','Mayo','Junio',
              'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][stmt.periodo_mes - 1]} {stmt.periodo_año}
          </div>
          {d.fecha_corte && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              Corte: {d.fecha_corte}{d.fecha_pago ? ` · Pago: ${d.fecha_pago}` : ''}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: esTarjeta ? '#e74c3c' : '#27ae60' }}>
            ${parseFloat(stmt.saldo || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {esTarjeta ? 'Saldo pendiente' : 'Saldo disponible'}
          </div>
        </div>
      </div>

      {/* Detalle de cargos */}
      {(d.cargos || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 4 }}>CARGOS:</div>
          {(d.cargos || []).map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 11, padding: '2px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ color: '#333', flex: 1 }}>
                {c.descripcion}
                {c.cuota_actual && ` (Cuota ${c.cuota_actual}/${c.cuota_total})`}
              </span>
              <span style={{ color: '#e74c3c', fontWeight: 'bold', marginLeft: 8 }}>
                ${parseFloat(c.monto || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Botón cargar */}
      {stmt.estado !== 'cargado' ? (
        <button
          onClick={() => onCargar(stmt.id)}
          disabled={cargando === stmt.id}
          style={{
            marginTop: 10, width: '100%',
            background: cargando === stmt.id ? '#95a5a6' : '#27ae60',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '8px 0', cursor: cargando === stmt.id ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: 12,
          }}>
          {cargando === stmt.id ? '⏳ Cargando...' : '✅ Cargar al Talonario'}
        </button>
      ) : (
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12,
          color: '#27ae60', fontWeight: 'bold' }}>
          ✅ Ya cargado al Talonario
        </div>
      )}
    </div>
  );
}

export default function HotmailSync() {
  const { mes, año } = useTalonario();
  const [user,         setUser]         = useState(null);
  const [tokenInfo,    setTokenInfo]    = useState(null);
  const [cargandoInfo, setCargandoInfo] = useState(true);
  const [sincronizando,setSincronizando]= useState(false);
  const [statements,   setStatements]  = useState([]);
  const [msgSync,      setMsgSync]     = useState('');
  const [cargando,     setCargando]    = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) cargarToken(data.user.id);
    });
  }, []);

  async function cargarToken(userId) {
    setCargandoInfo(true);
    const { data } = await supabase.from('ms_tokens')
      .select('email, expires_at').eq('user_id', userId).single();
    setTokenInfo(data || null);
    if (data) cargarPendientes(userId);
    setCargandoInfo(false);
  }

  async function cargarPendientes(userId) {
    const { data } = await supabase.from('bank_statements')
      .select('*').eq('user_id', userId)
      .eq('estado', 'procesado')
      .order('created_at', { ascending: false });
    setStatements(data || []);
  }

  function conectarHotmail() {
    if (!user) return;
    window.location.href = `/api/auth/microsoft?userId=${user.id}`;
  }

  async function desconectar() {
    if (!user) return;
    if (!window.confirm('¿Desconectar Hotmail? Se borrarán los tokens guardados.')) return;
    await supabase.from('ms_tokens').delete().eq('user_id', user.id);
    setTokenInfo(null);
    setStatements([]);
  }

  async function sincronizar() {
    if (!user) return;
    setSincronizando(true);
    setMsgSync('');
    try {
      const { data, error } = await supabase.functions.invoke('leer-emails-banco', {
        body: { userId: user.id },
      });
      if (error) throw new Error(error.message);

      if (data.total === 0) {
        setMsgSync('📭 Todo al día — no hay estados de cuenta nuevos');
      } else {
        setMsgSync(`✅ ${data.nuevos} nuevo(s) · ${data.pendientes} pendiente(s) de carga`);
        setStatements(data.statements || []);
      }
    } catch (e) {
      setMsgSync(`❌ Error: ${e.message}`);
    }
    setSincronizando(false);
  }

  async function cargarAlTalonario(statementId) {
    if (!user) return;
    setCargando(statementId);
    try {
      const { error } = await supabase.functions.invoke('cargar-estado-cuenta', {
        body: { statementId, userId: user.id },
      });
      if (error) throw new Error(error.message);
      setStatements(prev =>
        prev.map(s => s.id === statementId ? { ...s, estado: 'cargado' } : s)
      );
    } catch (e) {
      alert('Error al cargar: ' + e.message);
    }
    setCargando(null);
  }

  async function cargarTodos() {
    const pendientes = statements.filter(s => s.estado !== 'cargado');
    for (const s of pendientes) {
      await cargarAlTalonario(s.id);
    }
  }

  if (cargandoInfo) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Cargando...</div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* Panel de conexión */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16,
      }}>
        <div style={{ fontWeight: 'bold', fontSize: 15, color: '#1a2a4a', marginBottom: 12 }}>
          📧 Sincronización con Hotmail
        </div>

        {!tokenInfo ? (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Conecta tu Hotmail para que la IA lea automáticamente tus estados de cuenta bancarios.
            </p>
            <button onClick={conectarHotmail} style={{
              background: '#0078d4', color: 'white', border: 'none',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: 13,
            }}>
              📧 Conectar Hotmail
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                background: '#e8f5e9', color: '#27ae60', borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 'bold',
              }}>
                ✅ {tokenInfo.email}
              </div>
              <button onClick={sincronizar} disabled={sincronizando} style={{
                background: sincronizando ? '#95a5a6' : '#2980b9',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: sincronizando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold', fontSize: 12,
              }}>
                {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar estados de cuenta'}
              </button>
              <button onClick={desconectar} style={{
                background: 'white', color: '#e74c3c',
                border: '1.5px solid #e74c3c', borderRadius: 8,
                padding: '8px 12px', cursor: 'pointer', fontSize: 12,
              }}>
                ❌ Desconectar
              </button>
            </div>
            {msgSync && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: msgSync.startsWith('❌') ? '#fde8e8' : '#e8f5e9',
                color: msgSync.startsWith('❌') ? '#e74c3c' : '#27ae60',
                fontWeight: 'bold',
              }}>
                {msgSync}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resultados */}
      {statements.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a2a4a' }}>
              Estados de cuenta encontrados ({statements.length})
            </div>
            {statements.some(s => s.estado !== 'cargado') && (
              <button onClick={cargarTodos} style={{
                background: '#27ae60', color: 'white', border: 'none',
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 12,
              }}>
                ✅ Cargar todos al Talonario
              </button>
            )}
          </div>
          {statements.map(stmt => (
            <TarjetaEstado
              key={stmt.id}
              stmt={stmt}
              onCargar={cargarAlTalonario}
              cargando={cargando}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manejar redirect de OAuth en App.js**

En `src/App.js`, dentro del `useEffect` inicial (cerca de línea 300), agregar:

```javascript
// Detectar regreso del OAuth de Hotmail
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('hotmail') === 'conectado') {
    window.history.replaceState({}, '', window.location.pathname);
    // El HotmailSync detectará el token automáticamente al cargar
  }
}, []);
```

- [ ] **Step 3: Build y verificar**

```bash
npm run build 2>&1 | grep -i "error\|compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add src/components/contabilidad/talonario/hotmail/HotmailSync.js src/App.js
git commit -m "feat(hotmail): componente HotmailSync — conectar, sincronizar, cargar al Talonario"
```

---

## Task 9: TabTalonario.js — Agregar pestaña HOTMAIL

**Files:**
- Modify: `src/components/contabilidad/talonario/TabTalonario.js`

- [ ] **Step 1: Agregar import y tab**

En `src/components/contabilidad/talonario/TabTalonario.js`:

Agregar import después de los demás imports:
```javascript
import HotmailSync from './hotmail/HotmailSync';
```

En el array `GRUPOS`, agregar como último elemento:
```javascript
  { id: 'hotmail', label: '📧 HOTMAIL', subs: null },
```

En la sección de contenido (`{/* Contenido */}`), agregar:
```javascript
        {seccion === 'hotmail' && <HotmailSync />}
```

- [ ] **Step 2: Build y verificar**

```bash
npm run build 2>&1 | grep -i "error\|compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 3: Commit y push**

```bash
git add src/components/contabilidad/talonario/TabTalonario.js
git commit -m "feat(hotmail): pestaña HOTMAIL en Talonario"
git push origin main
```

---

## Task 10: Verificación manual

- [ ] **Step 1: Verificar SQL**

En Supabase confirmar tablas `ms_tokens` y `bank_statements` con sus columnas y RLS.

- [ ] **Step 2: Verificar variables Vercel**

Confirmar que están todas: `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_SECRET`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`.

- [ ] **Step 3: Verificar Edge Functions en Supabase**

En Supabase → Edge Functions → verificar que aparecen `leer-emails-banco` y `cargar-estado-cuenta`.

- [ ] **Step 4: Prueba del flujo OAuth**

1. Ir a Talonario → pestaña HOTMAIL
2. Click "📧 Conectar Hotmail"
3. Iniciar sesión con davidbi.br@hotmail.com
4. Aprobar permisos
5. Verificar redirección de vuelta a la app con `✅ davidbi.br@hotmail.com conectado`

- [ ] **Step 5: Prueba de sincronización**

1. Click "🔄 Sincronizar estados de cuenta"
2. Esperar resultado
3. Si hay estados: verificar que aparecen las tarjetas/bancos con sus saldos y cargos
4. Click "✅ Cargar al Talonario" en uno
5. Verificar en pestaña RESUMEN que el saldo cuenta corriente se actualizó (para banco) o en EGRESOS → Pagos Personales que aparecen los cargos (para tarjeta)
