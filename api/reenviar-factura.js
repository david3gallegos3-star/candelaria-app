// api/reenviar-factura.js
// Reenvía una factura autorizada por email usando la API de Dátil

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { datil_id, email } = req.body;
  if (!datil_id) return res.status(400).json({ error: 'datil_id requerido' });

  const emails = email ? [email] : [];

  try {
    const url = `https://link.datil.co/invoices/${datil_id}/email`;
    const datilRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key':        process.env.DATIL_API_KEY,
        'X-Password':   process.env.DATIL_PASSWORD,
      },
      body: JSON.stringify(emails.length ? { emails } : {}),
    });

    if (!datilRes.ok) {
      const data = await datilRes.json().catch(() => ({}));
      return res.status(400).json({ error: data?.mensaje || 'Error al reenviar' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
