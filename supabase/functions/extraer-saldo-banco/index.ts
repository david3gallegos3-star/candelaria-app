import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { tipo, contenido, nombre } = await req.json();

    const prompt = 'Extrae ÚNICAMENTE el saldo disponible o saldo final al cierre del período de este estado de cuenta bancario de Ecuador. Responde SOLO con el número, sin símbolo $, sin puntos de miles, usando punto decimal. Ejemplo: 31224.67';

    const messages = tipo === 'pdf'
      ? [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: contenido } },
          { type: 'text', text: prompt },
        ]}]
      : [{ role: 'user', content: `Archivo: ${nombre}\n\n${contenido.slice(0, 4000)}\n\n${prompt}` }];

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages,
    });

    const texto = resp.content[0].text.trim();
    const match = texto.match(/\d[\d.,]*\d/);
    const saldo = match ? parseFloat(match[0].replace(/\./g, '').replace(',', '.')) : null;

    return new Response(
      JSON.stringify({ saldo: saldo !== null ? saldo.toFixed(2) : null }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
