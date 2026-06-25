-- supabase/migrations/20260624_consumo_personal.sql
-- Registro de consumo personal de producto propio de la fabrica (embutidos,
-- jamones, etc.), sin transaccion de efectivo -- inventario que se uso sin
-- venderse. Tabla separada de talonario_pagos_personales porque no tiene
-- forma_pago/categoria, tiene producto_nombre/cantidad en su lugar.
-- No resta inventario_produccion todavia (pendiente, ver memoria de proyecto
-- project_inventario_ventas_gap -- se resolvera junto con el mismo hueco en ventas).
CREATE TABLE IF NOT EXISTS talonario_consumo_personal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  producto_nombre text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
