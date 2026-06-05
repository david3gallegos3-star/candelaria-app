ALTER TABLE facturas ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE cobros   ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE compras  ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE nomina   ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE nomina   ADD COLUMN IF NOT EXISTS forma_pago text DEFAULT 'transferencia';
