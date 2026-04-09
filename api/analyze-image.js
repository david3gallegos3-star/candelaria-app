export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageBase64, mediaType } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Analiza esta imagen de una factura o lista de precios de materias primas para una empresa de embutidos. Extrae TODOS los productos con su precio por kg y cantidad si aparece. Responde SOLO en JSON válido, sin texto adicional, sin markdown, sin backticks. Formato exacto: {"productos": [{"nombre": "nombre del producto", "precio_kg": 4.50, "cantidad_kg": 120, "confianza": "alta|media|baja"}]}. Si no puedes leer bien un valor pon null.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}