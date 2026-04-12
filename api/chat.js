module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensaje, historial } = req.body;

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
        max_tokens: 1000,
        system:     `Eres un asistente experto de Embutidos y Jamones Candelaria de Ibarra, Ecuador. 
Ayudas con producción, fórmulas, ingredientes, costos y materias primas de embutidos.
Responde siempre en español, de forma clara y concisa.`,
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