-- ============================================================
--  HSE Reporter — Esquema de Base de Datos
--  Compatible: PostgreSQL 14+ / SQLite 3+
-- ============================================================

-- ── OPERARIOS ─────────────────────────────────────────────
CREATE TABLE operarios (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(120) NOT NULL,
    email       VARCHAR(200) NOT NULL UNIQUE,
    area        VARCHAR(50),             -- área habitual
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── ÁREAS ─────────────────────────────────────────────────
CREATE TABLE areas (
    codigo      VARCHAR(20) PRIMARY KEY,  -- generacion, combustible, electrico, taller, predio
    nombre      VARCHAR(100) NOT NULL
);

INSERT INTO areas VALUES
  ('generacion',  'Generación'),
  ('combustible', 'Combustible'),
  ('electrico',   'Eléctrico'),
  ('taller',      'Taller'),
  ('predio',      'Predio / Exterior');

-- ── REPORTES ──────────────────────────────────────────────
CREATE TABLE reportes (
    id                VARCHAR(20) PRIMARY KEY,        -- HSE-XXXXXX
    tipo              VARCHAR(20) NOT NULL            -- 'acto' | 'condicion'
                        CHECK (tipo IN ('acto', 'condicion')),
    area              VARCHAR(20) NOT NULL
                        REFERENCES areas(codigo),
    descripcion       TEXT NOT NULL,
    ubicacion         VARCHAR(200),
    riesgo            VARCHAR(10) NOT NULL
                        CHECK (riesgo IN ('bajo', 'medio', 'alto')),
    foto_url          TEXT,                           -- ruta o URL de la imagen
    resuelto_momento  BOOLEAN DEFAULT FALSE,
    operario_id       INTEGER REFERENCES operarios(id),
    operario_nombre   VARCHAR(120),                   -- desnormalizado para velocidad
    estado            VARCHAR(20) DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'en_curso', 'cerrado')),
    timestamp         TIMESTAMP NOT NULL DEFAULT NOW(),
    cerrado_at        TIMESTAMP,
    created_at        TIMESTAMP DEFAULT NOW()
);

-- ── ACCIONES SOBRE REPORTES ───────────────────────────────
CREATE TABLE acciones (
    id              SERIAL PRIMARY KEY,
    reporte_id      VARCHAR(20) NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
    tipo_accion     VARCHAR(30) NOT NULL   -- 'inmediata' | 'correctiva' | 'preventiva'
                        CHECK (tipo_accion IN ('inmediata', 'correctiva', 'preventiva')),
    descripcion     TEXT NOT NULL,
    responsable_id  INTEGER REFERENCES operarios(id),
    fecha_limite    DATE,
    completada      BOOLEAN DEFAULT FALSE,
    completada_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ── LOG DE NOTIFICACIONES ─────────────────────────────────
CREATE TABLE notificaciones_log (
    id              SERIAL PRIMARY KEY,
    reporte_id      VARCHAR(20) REFERENCES reportes(id) ON DELETE CASCADE,
    destinatario    VARCHAR(200) NOT NULL,
    tipo            VARCHAR(30) NOT NULL,  -- 'alerta_alto', 'resumen_diario', etc.
    enviado         BOOLEAN DEFAULT FALSE,
    enviado_at      TIMESTAMP,
    error_msg       TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ── ÍNDICES ───────────────────────────────────────────────
CREATE INDEX idx_reportes_timestamp  ON reportes(timestamp DESC);
CREATE INDEX idx_reportes_riesgo     ON reportes(riesgo);
CREATE INDEX idx_reportes_estado     ON reportes(estado);
CREATE INDEX idx_reportes_area       ON reportes(area);
CREATE INDEX idx_acciones_reporte    ON acciones(reporte_id);

-- ── VISTA: REPORTES ABIERTOS POR ÁREA ────────────────────
CREATE VIEW v_reportes_abiertos AS
SELECT
    r.id,
    r.tipo,
    a.nombre          AS area,
    r.descripcion,
    r.ubicacion,
    r.riesgo,
    r.operario_nombre,
    r.timestamp,
    r.resuelto_momento,
    COUNT(ac.id)      AS acciones_pendientes
FROM reportes r
JOIN areas a ON a.codigo = r.area
LEFT JOIN acciones ac ON ac.reporte_id = r.id AND ac.completada = FALSE
WHERE r.estado != 'cerrado'
GROUP BY r.id, r.tipo, a.nombre, r.descripcion, r.ubicacion,
         r.riesgo, r.operario_nombre, r.timestamp, r.resuelto_momento
ORDER BY
    CASE r.riesgo WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
    r.timestamp DESC;

-- ── VISTA: RESUMEN DIARIO ─────────────────────────────────
CREATE VIEW v_resumen_diario AS
SELECT
    DATE(timestamp)   AS fecha,
    area,
    COUNT(*)          AS total,
    SUM(CASE WHEN riesgo = 'alto'  THEN 1 ELSE 0 END) AS alto,
    SUM(CASE WHEN riesgo = 'medio' THEN 1 ELSE 0 END) AS medio,
    SUM(CASE WHEN riesgo = 'bajo'  THEN 1 ELSE 0 END) AS bajo,
    SUM(CASE WHEN resuelto_momento THEN 1 ELSE 0 END)  AS resueltos_en_momento
FROM reportes
GROUP BY DATE(timestamp), area
ORDER BY fecha DESC, alto DESC;
