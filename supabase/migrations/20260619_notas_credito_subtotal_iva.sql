-- notas_credito.subtotal / .iva — para que los reportes (Formulario 104,
-- Conciliacion IVA, Cierre Mensual, etc.) puedan restar el efecto de una
-- nota de credito electronica sin tener que recalcular el IVA a mano.
-- Antes solo se guardaba el total combinado.
ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS subtotal numeric;
ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS iva numeric;
