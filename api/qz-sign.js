// api/qz-sign.js
// Firma peticiones de QZ Tray con la llave privada RSA

const { createSign } = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { toSign } = req.body;
  if (!toSign) return res.status(400).json({ error: 'toSign requerido' });

  try {
    const privateKey = process.env.QZ_PRIVATE_KEY;
    if (!privateKey) return res.status(500).json({ error: 'QZ_PRIVATE_KEY no configurada' });

    const sign = createSign('SHA512');
    sign.update(toSign);
    const signature = sign.sign(privateKey, 'base64');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ signature });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
