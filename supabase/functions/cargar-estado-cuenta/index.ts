// supabase/functions/cargar-estado-cuenta/index.ts
import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { statementId, userId } = await req.json();

    const { data: stmt, error: stmtErr } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('id', statementId)
      .eq('user_id', userId)
      .single();

    if (stmtErr || !stmt) throw new Error('Estado de cuenta no encontrado');
    if (stmt.estado === 'cargado') throw new Error('Ya fue cargado al Talonario');

    const mes = stmt.periodo_mes;
    const año = stmt.periodo_año;
    const datos = stmt.datos_json || {};

    if (stmt.tipo_cuenta === 'corriente' || stmt.tipo_cuenta === 'ahorros') {
      await supabase.from('config_contabilidad').upsert(
        { clave: `saldo_banco_${año}_${mes}`, valor: { saldo: String(stmt.saldo || 0) } },
        { onConflict: 'clave' }
      );
    }

    if (stmt.tipo_cuenta === 'tarjeta_credito') {
      const cargos = datos.cargos || [];
      if (cargos.length > 0) {
        const rows = cargos.map((c: any) => ({
          mes, año,
          fecha:        c.fecha ? c.fecha.split('/').reverse().join('-') : null,
          beneficiario: stmt.banco,
          concepto:     c.cuota_actual
            ? `${c.descripcion} (Cuota ${c.cuota_actual}/${c.cuota_total})`
            : c.descripcion,
          monto:        parseFloat(c.monto) || 0,
          categoria:    'tarjetas',
          forma_pago:   '19',
          comentario:   `${stmt.banco} ${stmt.red_tarjeta || ''} ****${stmt.ultimos4 || ''}`.trim(),
        }));
        await supabase.from('talonario_pagos_personales').insert(rows);
      }
    }

    await supabase.from('bank_statements')
      .update({ estado: 'cargado' })
      .eq('id', statementId);

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
