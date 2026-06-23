-- Catalogo de pagos personales recurrentes (ej: curso de Joaquin, Silvana)
-- para no tener que escribir nombre/concepto/monto cada mes desde cero,
-- igual al patron ya existente de pagos_fijos (empresa) pero sin asiento
-- contable ni vinculacion MOD+CIF, ya que Pagos Personales no toca el
-- Libro Diario.
CREATE TABLE IF NOT EXISTS pagos_fijos_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'gastos_personal',
  beneficiario text,
  concepto text,
  monto_default numeric NOT NULL DEFAULT 0,
  forma_pago text NOT NULL DEFAULT '20',
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE talonario_pagos_personales
  ADD COLUMN IF NOT EXISTS pago_fijo_personal_id uuid REFERENCES pagos_fijos_personales(id);
