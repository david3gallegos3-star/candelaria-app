// api/auth/microsoft.js
// Redirige al login de Microsoft para autorizar lectura de emails

module.exports = function handler(req, res) {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  'https://candelaria-app.vercel.app/api/auth/callback',
    scope:         'offline_access Mail.Read User.Read',
    response_mode: 'query',
    state:         userId,
  });

  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`;
  res.redirect(302, authUrl);
};
