// api/cron/sync-emails.js
// Cron semanal — sincroniza emails bancarios de todos los usuarios conectados

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: tokens } = await supabase
    .from('ms_tokens').select('user_id');

  if (!tokens?.length) return res.json({ synced: 0 });

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseAnon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  let synced = 0;

  for (const { user_id } of tokens) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/leer-emails-banco`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnon,
          'Authorization': `Bearer ${supabaseAnon}`,
        },
        body: JSON.stringify({ userId: user_id }),
      });
      synced++;
    } catch (e) {
      console.error('Error syncing user', user_id, e.message);
    }
  }

  return res.json({ synced, total: tokens.length });
};
