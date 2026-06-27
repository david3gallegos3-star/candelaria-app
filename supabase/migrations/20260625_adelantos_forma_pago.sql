-- supabase/migrations/20260625_adelantos_forma_pago.sql
-- Forma de pago del anticipo (efectivo/banco) -- solo se usa cuando
-- nomina_movimientos.tipo = 'anticipo'. Null para los demas tipos.
ALTER TABLE nomina_movimientos ADD COLUMN IF NOT EXISTS forma_pago text;

-- Marca que un gasto de caja chica viene de un adelanto de nomina (no se
-- puso a mano) -- TabCajaChica.js lo excluye de su tabla editable y del
-- autoguardado destructivo, y lo muestra aparte en modo solo lectura.
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS origen_nomina_movimiento_id uuid REFERENCES nomina_movimientos(id) ON DELETE SET NULL;

-- Misma marca para el caso "banco" -- permite borrar el pago vinculado si
-- se borra el anticipo desde Nomina.
ALTER TABLE talonario_pagos_banco ADD COLUMN IF NOT EXISTS origen_nomina_movimiento_id uuid REFERENCES nomina_movimientos(id) ON DELETE SET NULL;
