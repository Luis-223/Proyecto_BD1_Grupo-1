/* =========================================================
   12_metas.sql — MIS METAS (mis_metas.tsx)
   Ejecutar en la base FitManager (después de 11). Se puede ejecutar más de una vez.

   Tipos de meta (Meta.tipo_meta) y cómo se mide el avance:
     - Peso        → el último valor registrado (puede ser para bajar o subir)
     - Fuerza      → el último valor registrado (kg en un ejercicio)
     - Distancia   → la SUMA de lo registrado (km acumulados)
     - Asistencia  → AUTOMÁTICO: visitas al gimnasio (tabla Asistencia) desde
                     que se creó la meta. No se registra nada a mano.
     - Personalizada → el último valor registrado

   Cambios en la base:
     - Meta.valor_inicial (nueva, opcional): de dónde parte (ej. 80 kg).
       Si el objetivo es menor que el inicial, la meta es "bajar".
     - Tabla AvanceMeta: cada valor que registra el cliente.

   Crea:
     - usp_App_ListarMetas      → metas con su progreso + avances
     - usp_App_CrearMeta        → nueva meta
     - usp_App_RegistrarAvance  → anota un valor; si llega al objetivo, la meta queda Cumplida
     - usp_App_CancelarMeta     → la meta pasa a Cancelada

   Errores: números 50360 a 50379 (THROW).
   ========================================================= */

SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cambia la base en SSMS y vuelve a ejecutar.', 16, 1, @base_actual);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. CAMBIOS EN LAS TABLAS
   --------------------------------------------------------- */
IF COL_LENGTH('dbo.Meta', 'valor_inicial') IS NULL
    ALTER TABLE dbo.Meta ADD valor_inicial DECIMAL(10,2) NULL;
GO

IF OBJECT_ID('dbo.AvanceMeta', 'U') IS NULL
    CREATE TABLE dbo.AvanceMeta (
        id_avance  INT IDENTITY(1,1) PRIMARY KEY,
        id_meta    INT NOT NULL CONSTRAINT FK_AvanceMeta_Meta REFERENCES dbo.Meta(id_meta),
        fecha      DATETIME NOT NULL CONSTRAINT DF_AvanceMeta_Fecha DEFAULT GETDATE(),
        valor      DECIMAL(10,2) NOT NULL,
        nota       VARCHAR(150) NULL
    );
GO

/* ---------------------------------------------------------
   2. VALOR ACTUAL Y PROGRESO DE UNA META (función, para no repetir la cuenta)
      progreso = 0..100
   --------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_ProgresoMeta (@id_meta INT)
RETURNS TABLE
AS
RETURN
    SELECT m.id_meta,
           act.valor_actual,
           CAST(CASE
                WHEN act.valor_actual IS NULL OR m.valor_objetivo IS NULL THEN 0
                -- Meta para BAJAR (peso de 80 a 72): cuánto ha bajado de lo que tiene que bajar
                WHEN m.valor_inicial IS NOT NULL AND m.valor_objetivo < m.valor_inicial THEN
                     CASE WHEN act.valor_actual <= m.valor_objetivo THEN 100
                          WHEN act.valor_actual >= m.valor_inicial  THEN 0
                          ELSE 100.0 * (m.valor_inicial - act.valor_actual) / (m.valor_inicial - m.valor_objetivo) END
                -- Meta para SUBIR con punto de partida (press de 40 a 60 kg)
                WHEN m.valor_inicial IS NOT NULL AND m.valor_objetivo > m.valor_inicial THEN
                     CASE WHEN act.valor_actual >= m.valor_objetivo THEN 100
                          WHEN act.valor_actual <= m.valor_inicial  THEN 0
                          ELSE 100.0 * (act.valor_actual - m.valor_inicial) / (m.valor_objetivo - m.valor_inicial) END
                -- Sin punto de partida (distancia, asistencia): actual / objetivo
                WHEN m.valor_objetivo > 0 THEN
                     CASE WHEN act.valor_actual >= m.valor_objetivo THEN 100
                          ELSE 100.0 * act.valor_actual / m.valor_objetivo END
                ELSE 0 END AS DECIMAL(5,1)) AS progreso
    FROM dbo.Meta m
    CROSS APPLY (
        SELECT CASE
            WHEN m.tipo_meta = 'Asistencia' THEN
                (SELECT CAST(COUNT(*) AS DECIMAL(10,2)) FROM dbo.Asistencia a
                 WHERE a.id_cliente = m.id_cliente AND a.membresia_validada = 1
                   AND CAST(a.fecha_hora_ingreso AS DATE) >= m.fecha_inicio
                   AND (m.fecha_objetivo IS NULL OR CAST(a.fecha_hora_ingreso AS DATE) <= m.fecha_objetivo))
            WHEN m.tipo_meta = 'Distancia' THEN
                (SELECT SUM(av.valor) FROM dbo.AvanceMeta av WHERE av.id_meta = m.id_meta)
            ELSE
                (SELECT TOP 1 av.valor FROM dbo.AvanceMeta av WHERE av.id_meta = m.id_meta
                 ORDER BY av.fecha DESC, av.id_avance DESC)
            END AS valor_actual
    ) act
    WHERE m.id_meta = @id_meta;
GO

/* ---------------------------------------------------------
   3. LISTAR SUS METAS
      Antes de listar, las metas de asistencia que ya llegaron al
      objetivo pasan a "Cumplida" (las demás lo hacen al registrar avance).
      Resultado 1: metas (primero las que están en progreso)
      Resultado 2: avances de cada meta (más antiguos primero)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_ListarMetas
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE m SET estado = 'Cumplida'
    FROM Meta m
    CROSS APPLY dbo.fn_ProgresoMeta(m.id_meta) p
    WHERE m.id_cliente = @id_cliente AND m.estado = 'En progreso'
      AND m.tipo_meta = 'Asistencia' AND p.progreso >= 100;

    SELECT m.id_meta, m.tipo_meta, m.descripcion, m.unidad_medida,
           m.valor_inicial, m.valor_objetivo, p.valor_actual, p.progreso,
           m.fecha_inicio, m.fecha_objetivo, m.estado,
           CASE WHEN m.fecha_objetivo IS NULL THEN NULL
                ELSE DATEDIFF(DAY, CAST(GETDATE() AS DATE), m.fecha_objetivo) END AS dias_restantes,
           (SELECT COUNT(*) FROM AvanceMeta av WHERE av.id_meta = m.id_meta) AS cantidad_avances
    FROM Meta m
    CROSS APPLY dbo.fn_ProgresoMeta(m.id_meta) p
    WHERE m.id_cliente = @id_cliente
    ORDER BY CASE m.estado WHEN 'En progreso' THEN 0 WHEN 'Cumplida' THEN 1 ELSE 2 END,
             m.fecha_objetivo, m.id_meta DESC;

    SELECT av.id_meta, av.id_avance, av.fecha, av.valor, av.nota
    FROM AvanceMeta av
    JOIN Meta m ON m.id_meta = av.id_meta
    WHERE m.id_cliente = @id_cliente
    ORDER BY av.id_meta, av.fecha, av.id_avance;
END
GO

/* ---------------------------------------------------------
   4. CREAR UNA META
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_CrearMeta
    @id_cliente     INT,
    @tipo_meta      VARCHAR(50),
    @descripcion    VARCHAR(255),
    @valor_inicial  DECIMAL(10,2) = NULL,
    @valor_objetivo DECIMAL(10,2),
    @unidad_medida  VARCHAR(15),
    @fecha_objetivo DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM Cliente WHERE id_cliente = @id_cliente)
        THROW 50360, N'El cliente no existe.', 1;
    IF @tipo_meta NOT IN ('Peso', 'Fuerza', 'Distancia', 'Asistencia', 'Personalizada')
        THROW 50361, N'El tipo de meta no es válido.', 1;
    IF NULLIF(LTRIM(RTRIM(@descripcion)), '') IS NULL
        THROW 50362, N'Escribe de qué se trata la meta.', 1;
    IF @valor_objetivo IS NULL OR @valor_objetivo <= 0
        THROW 50363, N'El objetivo debe ser un número mayor que cero.', 1;
    IF @tipo_meta IN ('Peso', 'Fuerza') AND (@valor_inicial IS NULL OR @valor_inicial <= 0)
        THROW 50364, N'Escribe tu valor actual (de dónde partes).', 1;
    IF @valor_inicial IS NOT NULL AND @valor_inicial = @valor_objetivo
        THROW 50365, N'El objetivo debe ser distinto de tu valor actual.', 1;
    IF @fecha_objetivo IS NULL OR @fecha_objetivo <= CAST(GETDATE() AS DATE)
        THROW 50366, N'La fecha objetivo debe ser en el futuro.', 1;
    IF @fecha_objetivo > DATEADD(YEAR, 2, CAST(GETDATE() AS DATE))
        THROW 50367, N'La fecha objetivo no puede ser de más de 2 años.', 1;
    IF (SELECT COUNT(*) FROM Meta WHERE id_cliente = @id_cliente AND estado = 'En progreso') >= 10
        THROW 50368, N'Ya tienes 10 metas en progreso. Termina o cancela alguna antes de crear otra.', 1;

    INSERT INTO Meta (id_cliente, tipo_meta, descripcion, valor_objetivo, fecha_inicio,
                      fecha_objetivo, estado, unidad_medida, valor_inicial)
    VALUES (@id_cliente, @tipo_meta, LTRIM(RTRIM(@descripcion)), @valor_objetivo, CAST(GETDATE() AS DATE),
            @fecha_objetivo, 'En progreso', NULLIF(LTRIM(RTRIM(@unidad_medida)), ''),
            CASE WHEN @tipo_meta IN ('Distancia', 'Asistencia') THEN NULL ELSE @valor_inicial END);

    DECLARE @id_meta INT = SCOPE_IDENTITY();

    -- El valor inicial cuenta como primer avance (así la gráfica empieza ahí)
    IF @tipo_meta NOT IN ('Distancia', 'Asistencia') AND @valor_inicial IS NOT NULL
        INSERT INTO AvanceMeta (id_meta, valor, nota) VALUES (@id_meta, @valor_inicial, 'Punto de partida');

    SELECT @id_meta AS id_meta;
END
GO

/* ---------------------------------------------------------
   5. REGISTRAR UN AVANCE
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_RegistrarAvance
    @id_cliente INT,
    @id_meta    INT,
    @valor      DECIMAL(10,2),
    @nota       VARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @tipo VARCHAR(50), @estado VARCHAR(20);
    SELECT @tipo = tipo_meta, @estado = estado FROM Meta WHERE id_meta = @id_meta AND id_cliente = @id_cliente;

    IF @tipo IS NULL
        THROW 50370, N'No se encontró esa meta.', 1;
    IF @estado <> 'En progreso'
        THROW 50371, N'Esa meta ya no está en progreso.', 1;
    IF @tipo = 'Asistencia'
        THROW 50372, N'Las metas de asistencia se cuentan solas con tus entradas al gimnasio.', 1;
    IF @valor IS NULL OR @valor <= 0
        THROW 50373, N'El valor debe ser un número mayor que cero.', 1;

    BEGIN TRANSACTION;
        INSERT INTO AvanceMeta (id_meta, valor, nota) VALUES (@id_meta, @valor, NULLIF(LTRIM(RTRIM(@nota)), ''));

        UPDATE m SET estado = 'Cumplida'
        FROM Meta m
        CROSS APPLY dbo.fn_ProgresoMeta(m.id_meta) p
        WHERE m.id_meta = @id_meta AND p.progreso >= 100;
    COMMIT TRANSACTION;

    SELECT m.estado, p.valor_actual, p.progreso
    FROM Meta m CROSS APPLY dbo.fn_ProgresoMeta(m.id_meta) p
    WHERE m.id_meta = @id_meta;
END
GO

/* ---------------------------------------------------------
   6. CANCELAR UNA META (no se borra: queda en el historial)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_CancelarMeta
    @id_cliente INT,
    @id_meta    INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Meta SET estado = 'Cancelada'
    WHERE id_meta = @id_meta AND id_cliente = @id_cliente AND estado = 'En progreso';

    IF @@ROWCOUNT = 0
        THROW 50374, N'Esa meta no existe o ya no está en progreso.', 1;

    SELECT @id_meta AS id_meta;
END
GO

/* ---------------------------------------------------------
   7. PERMISOS (en Azure ya los tiene por EXECUTE sobre dbo)
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_App_ListarMetas TO '     + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_CrearMeta TO '       + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_RegistrarAvance TO ' + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_CancelarMeta TO '    + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

SELECT name AS objeto, type_desc FROM sys.objects
WHERE name IN ('AvanceMeta', 'fn_ProgresoMeta', 'usp_App_ListarMetas', 'usp_App_CrearMeta',
               'usp_App_RegistrarAvance', 'usp_App_CancelarMeta');
GO

SET NOEXEC OFF;
GO
