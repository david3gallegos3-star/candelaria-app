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
  "tipo_cuenta": "corriente",
  "red_tarjeta": null,
  "ultimos4": null,
  "periodo_mes": 6,
  "periodo_año": 2026,
  "saldo": 1234.56,
  "fecha_corte": null,
  "fecha_pago": null,
  "cargos": [
    {
      "fecha": "01/06/2026",
      "descripcion": "descripcion del cargo",
      "monto": 99.99,
      "cuota_actual": null,
      "cuota_total": null
    }
  ]
}

tipo_cuenta puede ser: "corriente" | "ahorros" | "tarjeta_credito"
red_tarjeta puede ser: "Visa" | "Mastercard" | "Diners" | "American Express" | null

Si no es un estado de cuenta bancario, responde: {"es_estado_cuenta": false}`;

async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data: token } = await supabase
    .from('ms_tokens').select('*').eq('user_id', userId).single();
  if (!token) return null;

  if (new Date(token.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return token.access_token;
  }

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

    const desde = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString().replace(/\.\d{3}Z$/, 'Z');

    const filterParam = encodeURIComponent(`receivedDateTime ge ${desde}`);
    const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?` +
      `$filter=${filterParam}` +
      `&$top=50&$select=id,subject,receivedDateTime,body,hasAttachments` +
      `&$orderby=${encodeURIComponent('receivedDateTime desc')}`;

    const emailsRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const emailsData = await emailsRes.json();

    // Filtrar localmente por palabras clave (insensible a mayúsculas)
    const allEmails = emailsData.value || [];
    const emails = allEmails.filter((email: any) => {
      const subject = (email.subject || '').toLowerCase();
      return BANK_KEYWORDS.some(k => subject.includes(k.toLowerCase()));
    });

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
      if (processedEmailIds.has(email.id)) {
        const stmt = (existing || []).find((s: any) => s.ms_email_id === email.id);
        if (stmt && stmt.estado === 'procesado') {
          const { data: fullStmt } = await supabase
            .from('bank_statements').select('*').eq('ms_email_id', email.id).eq('user_id', userId).single();
          if (fullStmt) pendientes.push(fullStmt);
        }
        continue;
      }

      let extracted: any = null;
      try {
        const bodyContent = email.body?.content || '';
        extracted = await extractWithClaude(bodyContent, false);

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

      const dupKey = `${extracted.banco}_${extracted.ultimos4}_${extracted.periodo_mes}_${extracted.periodo_año}`;
      if (loadedKeys.has(dupKey)) continue;

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

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
