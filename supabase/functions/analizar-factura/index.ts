// supabase/functions/analizar-factura/index.ts
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT = `Eres un experto en facturas comerciales de Ecuador (formato SRI).

Analiza esta factura y extrae los datos en JSON estricto. Responde SOLO con el JSON, sin markdown.

{
  "es_factura": true,
  "proveedor_nombre": "NOMBRE DEL PROVEEDOR",
  "proveedor_ruc": "RUC del proveedor",
  "numero_factura": "001-001-000000001",
  "autorizacion_sri": "número de autorización o null",
  "fecha_emision": "YYYY-MM-DD",
  "subtotal": 450.00,
  "base_iva0": 0,
  "base_iva15": 450.00,
  "iva": 67.50,
  "total": 517.50,
  "tiene_factura": true,
  "items": [
    {
      "descripcion": "descripción del producto/servicio",
      "cantidad": 50.0,
      "unidad": "kg",
      "precio_unitario": 9.00,
      "subtotal": 450.00
    }
  ]
}

Si no es una factura válida: {"es_factura": false}
Si un campo no está disponible, usa null.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { tipo, contenido, nombre } = await req.json();
    // tipo: 'pdf' | 'imagen'
    // contenido: base64 string
    // nombre: filename

    const mediaType = tipo === 'pdf' ? 'application/pdf'
      : nombre?.toLowerCase().endsWith('.png') ? 'image/png'
      : 'image/jpeg';

    const contentBlock = tipo === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: contenido } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: contenido } };

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text', text: PROMPT }],
      }],
    });

    const texto = resp.content[0].text.trim();
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude no retornó JSON');
    const datos = JSON.parse(match[0]);

    return new Response(JSON.stringify(datos),
      { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, es_factura: false }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
