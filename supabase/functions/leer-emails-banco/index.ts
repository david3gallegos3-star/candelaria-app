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

Analiza este estado de cuenta y extrae TODOS los datos incluyendo CADA transacción individual.

Reglas importantes:
- periodo_mes y periodo_año = MES DEL ESTADO (no fecha de envío)
- saldo = saldo pendiente total para tarjetas, saldo disponible para cuentas
- transacciones: EXTRAER CADA FILA del detalle de movimientos — consumos, pagos, diferidos, intereses
- tipo_transaccion: "consumo" (compras/débitos), "pago" (pagos al banco), "diferido" (cuotas diferidas), "interes" (intereses/cargos financieros), "prestamo" (cuotas de préstamo)
- CUOTAS DE DIFERIDOS (MUY IMPORTANTE): En los estados de cuenta ecuatorianos, las filas con tipo DIF tienen una columna con formato "NN/TT" que indica cuota_actual/cuota_total. Por ejemplo "07/12" significa cuota 7 de 12, "02/03" significa cuota 2 de 3, "02/05" significa cuota 2 de 5. SIEMPRE extraer estos valores para TODAS las filas de tipo DIF/diferido.
- NO omitir transacciones — incluir todas aunque sean pequeñas
- Si no identificas un campo, usa null

Responde SOLO con este JSON (sin markdown, sin texto adicional):
{
  "es_estado_cuenta": true,
  "banco": "Banco del Pacífico",
  "tipo_cuenta": "tarjeta_credito",
  "red_tarjeta": "Visa",
  "ultimos4": "0806",
  "periodo_mes": 5,
  "periodo_año": 2026,
  "saldo": 776.92,
  "fecha_corte": "22/05/2026",
  "fecha_pago": "08/06/2026",
  "transacciones": [
    {
      "fecha": "01/05/2026",
      "descripcion": "BODEGA DEPORTIVA CAYAMBE",
      "monto": 72.00,
      "tipo_transaccion": "consumo",
      "cuota_actual": null,
      "cuota_total": null
    },
    {
      "fecha": "04/05/2026",
      "descripcion": "SU PAGO PAGO DIRECTO BDP",
      "monto": 150.00,
      "tipo_transaccion": "pago",
      "cuota_actual": null,
      "cuota_total": null
    },
    {
      "fecha": "08/04/2026",
      "descripcion": "DIFERIDO CONSUMOS WEB",
      "monto": 30.78,
      "tipo_transaccion": "diferido",
      "cuota_actual": 2,
      "cuota_total": 5
    }
  ]
}

tipo_cuenta: "corriente" | "ahorros" | "tarjeta_credito"
red_tarjeta: "Visa" | "Mastercard" | "Diners" | "American Express" | null

Si no es estado de cuenta bancario: {"es_estado_cuenta": false}`;

async function getValidAccessToken(): Promise<{ accessToken: string; userId: string } | null> {
  const { data: token } = await supabase
    .from('ms_tokens').select('*').limit(1).maybeSingle();
  if (!token) return null;

  if (new Date(token.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return { accessToken: token.access_token, userId: token.user_id };
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
  }).eq('user_id', token.user_id);

  return { accessToken: newTokens.access_token, userId: token.user_id };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
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
    const cleanContent = stripHtml(content);
    messages = [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nContenido del email:\n${cleanContent.slice(0, 8000)}`,
    }];
  }

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages,
  });

  const texto = resp.content[0].text.trim();
  // Extraer JSON aunque Claude agregue texto extra
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude no retornó JSON: ${texto.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

function calcularRango(mes: number, año: number): { desde: string; hasta: string } {
  const primerDia = new Date(año, mes - 1, 1);
  const desde = new Date(primerDia);
  desde.setDate(desde.getDate() - 30);
  const hasta = new Date(año, mes, 0, 23, 59, 59);
  return {
    desde: desde.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    hasta: hasta.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { userId: _userId, mes, año } = await req.json();
    if (!mes || !año) throw new Error('mes y año requeridos');
    const { desde, hasta } = calcularRango(mes, año);

    const tokenResult = await getValidAccessToken();
    if (!tokenResult) {
      return new Response(JSON.stringify({ error: 'no_token', message: 'Hotmail no conectado' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const { accessToken, userId } = tokenResult;

    // ConsistencyLevel: eventual + $count=true permite usar $filter con $orderby
    const graphUrl = `https://graph.microsoft.com/v1.0/me/messages` +
      `?$filter=${encodeURIComponent(`receivedDateTime ge ${desde} and receivedDateTime le ${hasta}`)}` +
      `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
      `&$count=true` +
      `&$top=50&$select=id,subject,receivedDateTime,body,hasAttachments`;

    const emailsRes = await fetch(graphUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'ConsistencyLevel': 'eventual',
      },
    });
    const emailsData = await emailsRes.json();

    // Si Graph API retornó error, loguearlo y continuar con array vacío
    if (emailsData.error) {
      console.error('Graph API error:', JSON.stringify(emailsData.error));
    }

    // Filtrar localmente por palabras clave (insensible a mayúsculas)
    const allEmails = emailsData.value || [];
    console.log(`Graph API: ${allEmails.length} emails encontrados para ${mes}/${año}`);
    const emails = allEmails.filter((email: any) => {
      const subject = (email.subject || '').toLowerCase();
      return BANK_KEYWORDS.some(k => subject.includes(k.toLowerCase()));
    });
    console.log(`Emails con palabras clave bancarias: ${emails.length}`);

    const { data: allProcessed } = await supabase
      .from('bank_statements')
      .select('ms_email_id');

    const { data: existing } = await supabase
      .from('bank_statements')
      .select('ms_email_id, banco, ultimos4, periodo_mes, periodo_año, estado')
      .eq('periodo_mes', mes)
      .eq('periodo_año', año);

    const processedEmailIds = new Set((allProcessed || []).map((s: any) => s.ms_email_id));
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
            .from('bank_statements').select('*').eq('ms_email_id', email.id).single();
          if (fullStmt) pendientes.push(fullStmt);
        }
        continue;
      }

      let extracted: any = null;
      try {
        // Siempre intentar PDF primero — tiene el detalle completo de transacciones
        if (email.hasAttachments) {
          const attachRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const attachData = await attachRes.json();
          const pdf = (attachData.value || []).find((a: any) =>
            a.contentType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf')
          );
          if (pdf?.contentBytes) {
            extracted = await extractWithClaude('', true, pdf.contentBytes);
            console.log(`PDF procesado: ${pdf.name}, transacciones: ${extracted?.transacciones?.length || 0}`);
          }
        }

        // Fallback al cuerpo del email si no hay PDF o falló
        if (!extracted?.es_estado_cuenta) {
          const bodyContent = email.body?.content || '';
          extracted = await extractWithClaude(bodyContent, false);
        }
      } catch (e) {
        console.error('Error extracting email', email.id, e);
        continue;
      }

      if (!extracted?.es_estado_cuenta) continue;

      if (extracted.periodo_mes !== mes || extracted.periodo_año !== año) {
        console.log(`Email período ${extracted.periodo_mes}/${extracted.periodo_año} — no coincide con ${mes}/${año}, omitiendo`);
        continue;
      }

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
