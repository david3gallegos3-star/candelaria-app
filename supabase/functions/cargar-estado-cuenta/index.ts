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

function parseFecha(f: string | null): string | null {
  if (!f) return null;
  // DD/MM/YYYY → YYYY-MM-DD
  const parts = f.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return f;
}

function categoriaDeTransaccion(tipo: string, tipoCuenta: string): string {
  if (tipoCuenta === 'tarjeta_credito') {
    if (tipo === 'pago') return null as any; // pagos al banco no se cargan como gasto
    return 'tarjetas';
  }
  if (tipoCuenta === 'corriente' || tipoCuenta === 'ahorros') {
    if (tipo === 'prestamo') return 'prestamos';
    return 'gastos_personal';
  }
  return 'otros';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { statementId, userId, categorias } = await req.json();
    const catMap = new Map<number, 'personal' | 'empresa'>(
      (categorias || []).map((c: any) => [c.index, c.destino])
    );

    const { data: stmt, error: stmtErr } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('id', statementId)
      .single();

    if (stmtErr || !stmt) throw new Error('Estado de cuenta no encontrado');
    if (stmt.estado === 'cargado') throw new Error('Ya fue cargado al Talonario');

    const mes = stmt.periodo_mes;
    const año = stmt.periodo_año;
    const datos = stmt.datos_json || {};
    const comentarioBase = `${stmt.banco}${stmt.red_tarjeta ? ` ${stmt.red_tarjeta}` : ''}${stmt.ultimos4 ? ` ****${stmt.ultimos4}` : ''}`;

    // 1. Cuentas corrientes/ahorros → guardar saldo
    if (stmt.tipo_cuenta === 'corriente' || stmt.tipo_cuenta === 'ahorros') {
      await supabase.from('config_contabilidad').upsert(
        { clave: `saldo_banco_${año}_${mes}`, valor: { saldo: String(stmt.saldo || 0) } },
        { onConflict: 'clave' }
      );
    }

    // 2. Insertar cada transacción individual, ruteando por destino
    const transacciones = datos.transacciones || datos.cargos || [];
    const personalRows: any[] = [];
    const empresaRows: any[] = [];

    for (let i = 0; i < transacciones.length; i++) {
      const t = transacciones[i];
      const categoria = categoriaDeTransaccion(t.tipo_transaccion || 'consumo', stmt.tipo_cuenta);
      if (!categoria) continue; // skip pagos al banco

      const destino = catMap.size > 0 ? (catMap.get(i) || 'personal') : 'personal';

      let concepto = t.descripcion || '';
      if (t.cuota_actual && t.cuota_total) {
        concepto += ` (Cuota ${t.cuota_actual}/${t.cuota_total})`;
      }

      if (destino === 'empresa') {
        empresaRows.push({
          mes, año,
          fecha:        parseFecha(t.fecha),
          beneficiario: t.descripcion || stmt.banco,
          concepto,
          monto:        parseFloat(t.monto) || 0,
          forma_pago:   stmt.tipo_cuenta === 'tarjeta_credito' ? '19' : '20',
          comentario:   comentarioBase,
        });
      } else {
        personalRows.push({
          mes, año,
          fecha:        parseFecha(t.fecha),
          beneficiario: t.descripcion || stmt.banco,
          concepto,
          monto:        parseFloat(t.monto) || 0,
          categoria,
          forma_pago:   stmt.tipo_cuenta === 'tarjeta_credito' ? '19' : '20',
          comentario:   comentarioBase,
        });
      }
    }

    if (personalRows.length > 0) {
      await supabase.from('talonario_pagos_personales').insert(personalRows);
    }
    if (empresaRows.length > 0) {
      await supabase.from('talonario_pagos_banco').insert(empresaRows);
    }

    // 3. Marcar como cargado
    await supabase.from('bank_statements')
      .update({ estado: 'cargado' })
      .eq('id', statementId);

    return new Response(JSON.stringify({
      ok: true,
      transacciones_cargadas: personalRows.length + empresaRows.length,
      personal: personalRows.length,
      empresa: empresaRows.length,
    }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
