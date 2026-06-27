-- supabase/migrations/20260627_reorganizacion_pagos_personales.sql

-- Registro simple de facturas a nombre del dueño hechas por otras personas
-- de la familia -- puro registro, sin forma de pago, no afecta el Resumen
-- ni el saldo bancario calculado.
CREATE TABLE IF NOT EXISTS talonario_registro_facturas_dueno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  ruc text,
  proveedor text NOT NULL,
  numero_factura text,
  valor numeric NOT NULL DEFAULT 0,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Marca un pago fijo personal como servicio basico (luz, agua, etc.) y guarda
-- la empresa proveedora -- se usa para decidir si el registro mensual se
-- vincula a Caja Chica (efectivo) o a Movimientos Banco (banco), y para la
-- alerta anti-duplicado en Caja Chica.
ALTER TABLE pagos_fijos_personales ADD COLUMN IF NOT EXISTS es_servicio_basico boolean NOT NULL DEFAULT false;
ALTER TABLE pagos_fijos_personales ADD COLUMN IF NOT EXISTS empresa text;

-- Numero de factura del registro mensual de un servicio basico.
ALTER TABLE talonario_pagos_personales ADD COLUMN IF NOT EXISTS numero_factura text;

-- Vinculo entre el registro mensual de un servicio basico (talonario_pagos_personales)
-- y el gasto/pago que se crea automaticamente en Caja Chica o en Movimientos Banco --
-- mismo patron ya usado para Adelantos de Nomina (origen_nomina_movimiento_id).
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS origen_pago_personal_id uuid REFERENCES talonario_pagos_personales(id) ON DELETE SET NULL;
ALTER TABLE talonario_pagos_banco ADD COLUMN IF NOT EXISTS origen_pago_personal_id uuid REFERENCES talonario_pagos_personales(id) ON DELETE SET NULL;
