-- 1. compras.created_at — backfill correcto (orden importa: ver nota abajo)
ALTER TABLE compras ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE compras SET created_at = fecha::timestamptz WHERE created_at IS NULL;
ALTER TABLE compras ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE compras ALTER COLUMN created_at SET NOT NULL;

-- 2. pagos_compras.tipo — distingue pagos normales de devoluciones de proveedor
ALTER TABLE pagos_compras ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'pago';

-- 3. libro_diario.origen — agregar 'devoluciones_proveedor' al CHECK existente
ALTER TABLE libro_diario DROP CONSTRAINT IF EXISTS libro_diario_origen_check;
ALTER TABLE libro_diario ADD CONSTRAINT libro_diario_origen_check
  CHECK (origen IN ('facturacion','compras','nomina','caja_chica','manual','asiento_inicial','devoluciones_proveedor'));
