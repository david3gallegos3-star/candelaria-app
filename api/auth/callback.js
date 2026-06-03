// api/auth/callback.js
// Intercambia el authorization code por tokens y los guarda en Supabase

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const { code, state: userId, error: msError } = req.query;

  if (msError || !code) {
    return res.redirect(302, `https://candelaria-app.vercel.app?hotmail_error=${msError || 'sin_codigo'}`);
  }

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri:  'https://candelaria-app.vercel.app/api/auth/callback',
        grant_type:    'authorization_code',
        scope:         'offline_access Mail.Read User.Read',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // 2. Obtener email del usuario desde Graph API
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.mail || profile.userPrincipalName || 'desconocido';

    // 3. Guardar en Supabase usando service key
    const supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    const { error: dbErr } = await supabase.from('ms_tokens').upsert({
      user_id:       userId,
      email,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (dbErr) throw new Error(dbErr.message);

    res.redirect(302, 'https://candelaria-app.vercel.app?hotmail=conectado');
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect(302, `https://candelaria-app.vercel.app?hotmail_error=${encodeURIComponent(e.message)}`);
  }
};
