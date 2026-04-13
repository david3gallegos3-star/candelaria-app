// ============================================
// api/analyze-formula.js
// Analiza una hoja de Excel (como imagen base64)
// con Claude Vision y extrae datos de fórmula
// ============================================
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageBase64, mediaType, nombreHoja } = req.body;

  const prompt = `Analiza esta imagen de una hoja de fórmula de producto de una empresa de embutidos.

Extrae EXACTAMENTE estos datos:
1. Nombre del producto (generalmente en la parte superior, puede estar en negrita o destacado)
2. Lista de ingredientes de MATERIAS PRIMAS (sección MP) con sus gramos
3. Lista de ingredientes de CONDIMENTOS Y ADITIVOS (sección AD) con sus gramos  
4. Merma % (número decimal, ej: 0.20 para 20%)
5. Margen de ganancia % (número decimal, ej: 0.35 para 35%)
6. Empaque/Tripa (nombre del empaque usado)
7. Cantidad de empaque usada
8. Amarre/Hilo kg usados

IMPORTANTE:
- Los ingredientes MP van ANTES de la sección "CONDIMENTOS Y ADITIVOS"
- Los ingredientes AD van DESPUÉS de "CONDIMENTOS Y ADITIVOS"
- Ignora filas de SUB-TOTAL, TOTAL CRUDO, fórmulas de Excel (#REF, #VALUE)
- Solo incluye ingredientes con gramos numéricos válidos
- Si un valor no aparece claramente, usa null

Responde SOLO en JSON válido, sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{
  "nombre_producto": "Nombre del producto",
  "merma": 0.20,
  "margen": 0.35,
  "empaque_nombre": "Tripa 32-34",
  "empaque_cantidad": 0.3,
  "hilo_kg": 0.05,
  "ingredientes_mp": [
    {"nombre": "Res", "gramos": 4800},
    {"nombre": "Cerdo", "gramos": 2000}
  ],
  "ingredientes_ad": [
    {"nombre": "Sal", "gramos": 420},
    {"nombre": "Eritorbato", "gramos": 10}
  ]
}`;

  try {
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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/png',
                data: imageBase64
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

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