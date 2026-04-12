module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageBase64, mediaType, esPDF, pdfBase64 } = req.body;

  // ── Prompt unificado para imagen y PDF ──
  const promptTexto = `Analiza esta factura o lista de precios de materias primas para una empresa de embutidos.

Extrae TODOS los productos con su precio y cantidad. 
MUY IMPORTANTE: detecta y devuelve la unidad de medida EXACTA que aparece en el documento.

Unidades posibles: kg, g, gr, gramos, lb, libras, lbs, oz, onzas, t, tonelada, unidad, litro, l, metro, m

Responde SOLO en JSON válido, sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{
  "productos": [
    {
      "nombre": "nombre del producto",
      "precio_unitario": 4.50,
      "cantidad": 120,
      "unidad_original": "lb",
      "precio_kg": null,
      "cantidad_kg": null,
      "confianza": "alta|media|baja"
    }
  ]
}

Reglas:
- precio_unitario: el precio tal como aparece en la factura (por lb, por kg, por unidad, etc.)
- cantidad: la cantidad tal como aparece en la factura
- unidad_original: la unidad EXACTA que aparece (lb, kg, g, oz, t, etc.)
- precio_kg y cantidad_kg: déjalos en null, el sistema los calculará
- Si no puedes leer bien un valor pon null
- Si la unidad no es clara pon "desconocida"`;

  try {
    let mensajeContent = [];

    if (esPDF && pdfBase64) {
      // ── Modo PDF ──
      mensajeContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64
          }
        },
        { type: 'text', text: promptTexto }
      ];
    } else {
      // ── Modo imagen/cámara ──
      mensajeContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType || 'image/jpeg',
            data: imageBase64
          }
        },
        { type: 'text', text: promptTexto }
      ];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 2000,
        messages: [{ role: 'user', content: mensajeContent }]
      })
    });

    const data = await response.json();
    // Limpiar backticks markdown que a veces devuelve el modelo
    if (data.content?.[0]?.text) {
      data.content[0].text = data.content[0].text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};