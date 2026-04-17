module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensaje, historial, contexto, archivo } = req.body;

  const systemBase = `Eres un asistente experto de Embutidos y Jamones Candelaria de Ibarra, Ecuador.
Ayudas con producción, fórmulas, ingredientes, costos y materias primas de embutidos.
Responde siempre en español, de forma clara y concisa.

IMPORTANTE: Cuando el usuario te pida sugerir, crear o mejorar una fórmula de embutido, SIEMPRE incluye al final de tu respuesta un bloque en exactamente este formato (una sola línea continua):
FORMULA_JSON:{"nombre":"Nombre del producto","mp":[{"nombre":"Ingrediente","gramos":500}],"ad":[{"nombre":"Condimento","gramos":20}]}
Donde "mp" = materias primas y "ad" = condimentos/aditivos. Los gramos son por parada/batch completa.
Si el usuario no pide fórmulas, NO incluyas FORMULA_JSON.`;

  const system = contexto
    ? `${systemBase}\n\n${contexto}\n\nCuando el usuario pregunte sobre la fórmula activa, usa esos datos para dar recomendaciones específicas.`
    : systemBase;

  try {
    // Construir historial de mensajes
    const messages = [
      ...(historial || []).map(m => ({
        role: m.rol === 'tu' ? 'user' : 'assistant',
        content: m.texto
      })),
    ];

    // Último mensaje — puede incluir imagen/archivo
    let ultimoContenido;
    if (archivo && archivo.base64 && archivo.mimeType) {
      const esPDF = archivo.mimeType === 'application/pdf';
      ultimoContenido = [
        esPDF
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivo.base64 } }
          : { type: 'image',    source: { type: 'base64', media_type: archivo.mimeType,  data: archivo.base64 } },
        { type: 'text', text: mensaje || 'Analiza este archivo.' }
      ];
    } else {
      ultimoContenido = mensaje;
    }

    messages.push({ role: 'user', content: ultimoContenido });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
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
