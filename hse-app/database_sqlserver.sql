-- ============================================================
--  HSE Reporter — Esquema SQL Server 2016
--  Ejecutar este script UNA VEZ para crear la base de datos
--  Conectarse primero como sa o con permisos de DBO
-- ============================================================

-- 1. Crear base de datos
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'hse_db')
BEGIN
    CREATE DATABASE hse_db
        COLLATE SQL_Latin1_General_CP1_CI_AS;
    PRINT 'Base de datos hse_db creada.';
END
GO

USE hse_db;
GO

-- 2. Crear usuario de aplicación (reemplazá la contraseña)
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'hse_app')
BEGIN
    CREATE LOGIN hse_app WITH PASSWORD = 'HseApp2024!';
    PRINT 'Login hse_app creado.';
END
GO

IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'hse_app')
BEGIN
    CREATE USER hse_app FOR LOGIN hse_app;
    ALTER ROLE db_datareader ADD MEMBER hse_app;
    ALTER ROLE db_datawriter ADD MEMBER hse_app;
    PRINT 'Usuario hse_app con permisos de lectura/escritura creado.';
END
GO

-- ── TABLA: areas ──────────────────────────────────────────
IF OBJECT_ID('dbo.areas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.areas (
        codigo  NVARCHAR(20)  NOT NULL PRIMARY KEY,
        nombre  NVARCHAR(100) NOT NULL
    );

    INSERT INTO dbo.areas VALUES
        ('generacion',  N'Generación'),
        ('combustible', N'Combustible'),
        ('electrico',   N'Eléctrico'),
        ('taller',      N'Taller'),
        ('predio',      N'Predio / Exterior');

    PRINT 'Tabla areas creada.';
END
GO

-- ── TABLA: reportes ───────────────────────────────────────
IF OBJECT_ID('dbo.reportes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.reportes (
        id                NVARCHAR(20)   NOT NULL PRIMARY KEY,
        tipo              NVARCHAR(20)   NOT NULL
                            CONSTRAINT chk_tipo CHECK (tipo IN ('acto', 'condicion')),
        area              NVARCHAR(20)   NOT NULL
                            CONSTRAINT fk_area FOREIGN KEY REFERENCES dbo.areas(codigo),
        descripcion       NVARCHAR(MAX)  NOT NULL,
        ubicacion         NVARCHAR(200)  NULL,
        riesgo            NVARCHAR(10)   NOT NULL
                            CONSTRAINT chk_riesgo CHECK (riesgo IN ('bajo', 'medio', 'alto')),
        foto_base64       NVARCHAR(MAX)  NULL,
        resuelto_momento  BIT            NOT NULL DEFAULT 0,
        operario_nombre   NVARCHAR(120)  NULL,
        estado            NVARCHAR(20)   NOT NULL DEFAULT 'pendiente'
                            CONSTRAINT chk_estado CHECK (estado IN ('pendiente', 'en_curso', 'cerrado')),
        accion_inmediata  NVARCHAR(MAX)  NULL,
        accion_correctiva NVARCHAR(MAX)  NULL,
        accion_preventiva NVARCHAR(MAX)  NULL,
        timestamp_reporte DATETIME2      NOT NULL DEFAULT GETDATE(),
        cerrado_at        DATETIME2      NULL,
        updated_at        DATETIME2      NULL,
        received_at       DATETIME2      NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Tabla reportes creada.';
END
GO

-- ── TABLA: notificaciones_log ─────────────────────────────
IF OBJECT_ID('dbo.notificaciones_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.notificaciones_log (
        id            INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
        reporte_id    NVARCHAR(20)  NOT NULL
                        CONSTRAINT fk_notif_reporte FOREIGN KEY REFERENCES dbo.reportes(id),
        destinatario  NVARCHAR(200) NOT NULL,
        tipo          NVARCHAR(50)  NOT NULL,
        enviado       BIT           NOT NULL DEFAULT 0,
        enviado_at    DATETIME2     NULL,
        error_msg     NVARCHAR(500) NULL,
        created_at    DATETIME2     NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Tabla notificaciones_log creada.';
END
GO

-- ── ÍNDICES ───────────────────────────────────────────────
IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_reportes_timestamp')
    CREATE INDEX idx_reportes_timestamp ON dbo.reportes(timestamp_reporte DESC);

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_reportes_riesgo')
    CREATE INDEX idx_reportes_riesgo ON dbo.reportes(riesgo);

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_reportes_estado')
    CREATE INDEX idx_reportes_estado ON dbo.reportes(estado);

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_reportes_area')
    CREATE INDEX idx_reportes_area ON dbo.reportes(area);
GO

-- ── VISTA: reportes activos por prioridad ─────────────────
IF OBJECT_ID('dbo.v_reportes_activos', 'V') IS NOT NULL
    DROP VIEW dbo.v_reportes_activos;
GO

CREATE VIEW dbo.v_reportes_activos AS
SELECT
    r.id,
    r.tipo,
    a.nombre          AS area,
    r.descripcion,
    r.ubicacion,
    r.riesgo,
    r.operario_nombre,
    r.estado,
    r.resuelto_momento,
    r.timestamp_reporte,
    CASE r.riesgo
        WHEN 'alto'  THEN 1
        WHEN 'medio' THEN 2
        ELSE 3
    END AS prioridad_orden
FROM dbo.reportes r
JOIN dbo.areas a ON a.codigo = r.area
WHERE r.estado <> 'cerrado';
GO

-- ── VISTA: resumen diario ─────────────────────────────────
IF OBJECT_ID('dbo.v_resumen_diario', 'V') IS NOT NULL
    DROP VIEW dbo.v_resumen_diario;
GO

CREATE VIEW dbo.v_resumen_diario AS
SELECT
    CAST(timestamp_reporte AS DATE)                               AS fecha,
    area,
    COUNT(*)                                                       AS total,
    SUM(CASE WHEN riesgo = 'alto'          THEN 1 ELSE 0 END)    AS alto,
    SUM(CASE WHEN riesgo = 'medio'         THEN 1 ELSE 0 END)    AS medio,
    SUM(CASE WHEN riesgo = 'bajo'          THEN 1 ELSE 0 END)    AS bajo,
    SUM(CASE WHEN resuelto_momento = 1     THEN 1 ELSE 0 END)    AS resueltos_en_momento,
    SUM(CASE WHEN estado = 'cerrado'       THEN 1 ELSE 0 END)    AS cerrados
FROM dbo.reportes
GROUP BY CAST(timestamp_reporte AS DATE), area;
GO

PRINT '=== Schema HSE creado exitosamente en hse_db ===';
