-- ── 1. cuentas_contables ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_contables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text UNIQUE NOT NULL,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto')),
  nivel       int  NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  naturaleza  text NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── 2. libro_diario (cabecera) ────────────────────────────────
CREATE TABLE IF NOT EXISTS libro_diario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           date NOT NULL,
  descripcion     text NOT NULL,
  tipo            text NOT NULL DEFAULT 'tributario' CHECK (tipo IN ('tributario','interno')),
  origen          text NOT NULL CHECK (origen IN ('facturacion','compras','nomina','caja_chica','manual','asiento_inicial')),
  origen_id       uuid,
  estado          text NOT NULL DEFAULT 'provisional' CHECK (estado IN ('provisional','confirmado','eliminado')),
  confirmado_por  text,
  confirmado_at   timestamptz,
  created_at      timestamptz DEFAULT now(),
  created_by      text
);

-- ── 3. libro_diario_detalle (líneas debe/haber) ───────────────
CREATE TABLE IF NOT EXISTS libro_diario_detalle (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asiento_id  uuid NOT NULL REFERENCES libro_diario(id) ON DELETE CASCADE,
  cuenta_id   uuid NOT NULL REFERENCES cuentas_contables(id),
  descripcion text,
  debe        numeric(12,2) NOT NULL DEFAULT 0,
  haber       numeric(12,2) NOT NULL DEFAULT 0,
  orden       int NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ── 4. config_contabilidad ────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_contabilidad (
  clave text PRIMARY KEY,
  valor jsonb NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_libro_diario_fecha    ON libro_diario(fecha);
CREATE INDEX IF NOT EXISTS idx_libro_diario_estado   ON libro_diario(estado);
CREATE INDEX IF NOT EXISTS idx_libro_diario_origen   ON libro_diario(origen, origen_id);
CREATE INDEX IF NOT EXISTS idx_detalle_asiento_id    ON libro_diario_detalle(asiento_id);

-- ── 5. Seed Plan de Cuentas Ecuador ──────────────────────────
INSERT INTO cuentas_contables (codigo, nombre, tipo, nivel, naturaleza) VALUES
-- ACTIVO
('1',       'ACTIVO',                          'activo',    1, 'deudora'),
('1.1',     'Activo Corriente',                'activo',    2, 'deudora'),
('1.1.1',   'Caja y Bancos',                   'activo',    3, 'deudora'),
('1.1.1.01','Caja General',                    'activo',    4, 'deudora'),
('1.1.1.02','Caja Chica',                      'activo',    4, 'deudora'),
('1.1.1.03','Bancos',                          'activo',    4, 'deudora'),
('1.1.2',   'Cuentas por Cobrar',              'activo',    3, 'deudora'),
('1.1.2.01','Clientes',                        'activo',    4, 'deudora'),
('1.1.3',   'Inventarios',                     'activo',    3, 'deudora'),
('1.1.3.01','Inventario Materia Prima',        'activo',    4, 'deudora'),
('1.1.3.02','Inventario Producto Terminado',   'activo',    4, 'deudora'),
('1.1.4',   'IVA',                             'activo',    3, 'deudora'),
('1.1.4.01','IVA en Compras',                  'activo',    4, 'deudora'),
-- PASIVO
('2',       'PASIVO',                          'pasivo',    1, 'acreedora'),
('2.1',     'Pasivo Corriente',                'pasivo',    2, 'acreedora'),
('2.1.1',   'Cuentas por Pagar',               'pasivo',    3, 'acreedora'),
('2.1.1.01','Proveedores',                     'pasivo',    4, 'acreedora'),
('2.1.2',   'Obligaciones Laborales',          'pasivo',    3, 'acreedora'),
('2.1.2.01','IESS por Pagar',                  'pasivo',    4, 'acreedora'),
('2.1.2.02','Sueldos por Pagar',               'pasivo',    4, 'acreedora'),
('2.1.3',   'Obligaciones Tributarias',        'pasivo',    3, 'acreedora'),
('2.1.3.01','IVA Ventas por Pagar',            'pasivo',    4, 'acreedora'),
('2.1.3.02','Retenciones por Pagar',           'pasivo',    4, 'acreedora'),
-- PATRIMONIO
('3',       'PATRIMONIO',                      'patrimonio',1, 'acreedora'),
('3.1',     'Capital',                         'patrimonio',2, 'acreedora'),
('3.1.1',   'Capital Social',                  'patrimonio',3, 'acreedora'),
('3.1.1.01','Capital Social',                  'patrimonio',4, 'acreedora'),
-- INGRESOS
('4',       'INGRESOS',                        'ingreso',   1, 'acreedora'),
('4.1',     'Ingresos Operacionales',          'ingreso',   2, 'acreedora'),
('4.1.1',   'Ventas',                          'ingreso',   3, 'acreedora'),
('4.1.1.01','Ventas 15% IVA',                  'ingreso',   4, 'acreedora'),
('4.1.1.02','Ingresos Gerenciales',            'ingreso',   4, 'acreedora'),
-- GASTOS
('5',       'GASTOS',                          'gasto',     1, 'deudora'),
('5.1',     'Gastos Operacionales',            'gasto',     2, 'deudora'),
('5.1.1',   'Gastos de Personal',              'gasto',     3, 'deudora'),
('5.1.1.01','Gasto Sueldos y Salarios',        'gasto',     4, 'deudora'),
('5.1.1.02','Gasto IESS Patronal',             'gasto',     4, 'deudora'),
('5.1.2',   'Gastos Generales',                'gasto',     3, 'deudora'),
('5.1.2.01','Gasto Caja Chica',                'gasto',     4, 'deudora'),
('5.1.2.02','Costo Materia Prima',             'gasto',     4, 'deudora')
ON CONFLICT (codigo) DO NOTHING;

-- ── 6. Config inicial ─────────────────────────────────────────
INSERT INTO config_contabilidad (clave, valor) VALUES
('asiento_inicial', '{"completado": false, "fecha": null, "banco": 0, "caja": 0, "inventario": 0, "patrimonio": 0}'),
('cuentas_modulos', jsonb_build_object(
  'caja_general_id',      (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.01'),
  'caja_chica_id',        (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.02'),
  'banco_id',             (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.03'),
  'cxc_id',               (SELECT id FROM cuentas_contables WHERE codigo = '1.1.2.01'),
  'inventario_mp_id',     (SELECT id FROM cuentas_contables WHERE codigo = '1.1.3.01'),
  'iva_compras_id',       (SELECT id FROM cuentas_contables WHERE codigo = '1.1.4.01'),
  'cxp_id',               (SELECT id FROM cuentas_contables WHERE codigo = '2.1.1.01'),
  'iess_pagar_id',        (SELECT id FROM cuentas_contables WHERE codigo = '2.1.2.01'),
  'sueldos_pagar_id',     (SELECT id FROM cuentas_contables WHERE codigo = '2.1.2.02'),
  'iva_ventas_id',        (SELECT id FROM cuentas_contables WHERE codigo = '2.1.3.01'),
  'capital_id',           (SELECT id FROM cuentas_contables WHERE codigo = '3.1.1.01'),
  'ventas_gravadas_id',   (SELECT id FROM cuentas_contables WHERE codigo = '4.1.1.01'),
  'ventas_internas_id',   (SELECT id FROM cuentas_contables WHERE codigo = '4.1.1.02'),
  'sueldos_id',           (SELECT id FROM cuentas_contables WHERE codigo = '5.1.1.01'),
  'iess_patronal_id',     (SELECT id FROM cuentas_contables WHERE codigo = '5.1.1.02'),
  'gasto_caja_id',        (SELECT id FROM cuentas_contables WHERE codigo = '5.1.2.01'),
  'costo_mp_id',          (SELECT id FROM cuentas_contables WHERE codigo = '5.1.2.02')
))
ON CONFLICT (clave) DO NOTHING;
