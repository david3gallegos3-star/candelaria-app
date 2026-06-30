-- supabase/migrations/20260629_cliente_nombre_ruc_facturas.sql
-- Denormaliza nombre/RUC del cliente en facturas para que quede fijo al
-- momento de la venta (incluye Consumidor Final, que no tiene cliente_id).
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cliente_nombre text;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cliente_ruc text;
