-- supabase/migrations/20260628_servicios_basicos_propia_pestana.sql

-- Catalogo de Servicios Basicos (luz, agua, internet, etc.) -- propia pestana
-- en EGRESOS, separada de Pagos Fijos Personales. Vinculo opcional a MOD/CIF
-- (costeo de manufactura), mismo patron que pagos_fijos (empresa).
CREATE TABLE IF NOT EXISTS pagos_fijos_servicios_basicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  empresa text,
  monto_default numeric NOT NULL DEFAULT 0,
  forma_pago text NOT NULL DEFAULT '20',
  tipo_mod_cif text,
  mod_cif_row_id uuid,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Vinculo entre el registro mensual de un servicio basico y la fila que se
-- crea automaticamente en Caja Chica (efectivo) o Movimientos Banco (banco)
-- -- sin tabla intermedia, igual patron que origen_nomina_movimiento_id.
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS origen_servicio_basico_id uuid REFERENCES pagos_fijos_servicios_basicos(id) ON DELETE SET NULL;
ALTER TABLE talonario_pagos_banco ADD COLUMN IF NOT EXISTS origen_servicio_basico_id uuid REFERENCES pagos_fijos_servicios_basicos(id) ON DELETE SET NULL;

-- caja_gastos ya tiene numero_factura (gastos normales) -- talonario_pagos_banco no.
ALTER TABLE talonario_pagos_banco ADD COLUMN IF NOT EXISTS numero_factura text;
