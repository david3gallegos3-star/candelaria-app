ALTER TABLE compras_detalle ADD COLUMN IF NOT EXISTS descuento numeric DEFAULT 0;
ALTER TABLE compras_detalle ADD COLUMN IF NOT EXISTS iva_pct numeric DEFAULT 15;
ALTER TABLE compras_detalle ALTER COLUMN materia_prima_id DROP NOT NULL;
ALTER TABLE compras_detalle ALTER COLUMN cantidad_kg DROP NOT NULL;
ALTER TABLE compras_detalle ALTER COLUMN precio_kg DROP NOT NULL;

CREATE TABLE IF NOT EXISTS talonario_facturas_personales_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES talonario_facturas_personales(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  descuento numeric DEFAULT 0,
  iva_pct numeric DEFAULT 15,
  orden int DEFAULT 0
);

ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS base_iva15 numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS base_iva0  numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS iva        numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS descuento  numeric DEFAULT 0;
