// ============================================
// api/sugerir-formula.js
// Claude lee la fórmula completa y sugiere
// optimizaciones de costo/margen/ingredientes
// ============================================
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { formula } = req.body;
  if (!formula) return res.status(400).json({ error: 'Falta el campo formula' });

  const prompt = `Eres un experto en formulación de embutidos y costos industriales para una empresa de embutidos en Ecuador (Candelaria, Ibarra).

Se te presenta la fórmula actual del producto "${formula.producto}".

MATERIAS PRIMAS:
${formula.materialesPrimas.map(m =>
  `- ${m.nombre}: ${m.gramos}g (${(m.gramos/1000).toFixed(3)} kg) — precio: $${m.precio_kg}/kg — subtotal: $${((m.gramos/1000)*m.precio_kg).toFixed(4)}`
).join('\n')}

CONDIMENTOS Y ADITIVOS:
${formula.condimentosAditivos.map(m =>
  `- ${m.nombre}: ${m.gramos}g (${(m.gramos/1000).toFixed(3)} kg) — precio: $${m.precio_kg}/kg — subtotal: $${((m.gramos/1000)*m.precio_kg).toFixed(4)}`
).join('\n')}

PARÁMETROS ACTUALES:
- Merma: ${formula.merma_pct}
- Margen de ganancia: ${formula.margen_pct}
- Costo total/kg: $${formula.costo_total_kg}
- Precio de venta/kg: $${formula.precio_venta_kg}

Analiza esta fórmula y responde en ESPAÑOL con sugerencias concretas y accionables:

1. **Ingrediente(s) más caro(s)** — identifica cuáles tienen mayor impacto en el costo y sugiere alternativas o ajustes de gramos.
2. **Oportunidades de ahorro** — cambios que podrían bajar el costo/kg sin comprometer calidad.
3. **Balance de la fórmula** — observaciones sobre proporciones (exceso o falta de algún componente típico para este tipo de embutido).
4. **Prioridad de acción** — cuál de las sugerencias tiene el mayor impacto potencial.

Responde en texto claro y directo, sin markdown excesivo. Máximo 350 palabras.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const texto = data.content?.[0]?.text || '';
    res.status(200).json({ sugerencia: texto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
