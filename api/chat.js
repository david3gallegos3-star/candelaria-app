module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensaje, historial, contexto } = req.body;

  const systemBase = `Eres un asistente experto de Embutidos y Jamones Candelaria de Ibarra, Ecuador.
Ayudas con producción, fórmulas, ingredientes, costos y materias primas de embutidos.
Responde siempre en español, de forma clara y concisa.`;

  const instruccionFormula = contexto ? `

${contexto}

Cuando el usuario pregunte sobre la fórmula, usa los datos anteriores para dar recomendaciones específicas.

INSTRUCCIÓN IMPORTANTE: Si el usuario pide una fórmula nueva, modificada, sugerida o mejorada (con ingredientes y gramos), al FINAL de tu respuesta agrega un bloque con este formato exacto (sin espacios extra):
<FORMULA_JSON>{"nombre":"NOMBRE DEL PRODUCTO","mp":[{"n":"Ingrediente","g":1000},...],"ad":[{"n":"Condimento","g":50},...]}
</FORMULA_JSON>
Solo incluye este bloque si realmente estás proponiendo ingredientes con cantidades específicas en gramos. Si solo estás explicando o respondiendo preguntas generales, NO lo incluyas.` : '';

  const system = `${systemBase}${instruccionFormula}`;

  try {
    const messages = [
      ...(historial || []).map(m => ({
        role:    m.rol === 'tu' ? 'user' : 'assistant',
        content: m.texto
      })),
      { role:'user', content: mensaje }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system,
        messages
      })
    });

    const data = await response.json();
    const texto = data.content?.[0]?.text || 'Sin respuesta';
    res.status(200).json({ texto });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};