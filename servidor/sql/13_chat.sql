/* =========================================================
   13_chat.sql — CHAT DIRECTO ENTRE LA APP Y LA SUCURSAL
   Ejecutar en la base FitManager (después de 12). Se puede ejecutar más de una vez.

   Cómo funciona:
     - El cliente escribe desde la app (chat.tsx → servidor Node → usp_App_Chat*).
     - La recepción contesta desde la app de escritorio
       (PRINCIPAL.py → página "Chat con clientes" → usp_Escritorio_Chat*).
     - Cada mensaje queda guardado con la sucursal del cliente. Las dos
       apps preguntan cada pocos segundos si hay mensajes nuevos.
     - La hora se guarda en UTC y se devuelve en hora de Guatemala
       (así no sale con 6 horas de diferencia).

   Crea:
     - Tabla ChatMensaje
     - App:        usp_App_ChatListar, usp_App_ChatEnviar, usp_App_ChatSinLeer
     - Escritorio: usp_Escritorio_ChatConversaciones, usp_Escritorio_ChatMensajes,
                   usp_Escritorio_ChatEnviar, usp_Escritorio_ChatSinLeer

   Errores: números 50380 a 50399 (THROW).
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
   1. TABLA
   --------------------------------------------------------- */
IF OBJECT_ID('dbo.ChatMensaje', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChatMensaje (
        id_mensaje          INT IDENTITY(1,1) CONSTRAINT PK_ChatMensaje PRIMARY KEY,
        id_cliente          INT            NOT NULL CONSTRAINT FK_ChatMensaje_Cliente  REFERENCES dbo.Cliente(id_cliente),
        id_sucursal         INT            NOT NULL CONSTRAINT FK_ChatMensaje_Sucursal REFERENCES dbo.Sucursal(id_sucursal),
        de_cliente          BIT            NOT NULL,             -- 1 = lo escribió el cliente; 0 = la sucursal
        id_usuario_empleado INT            NULL     CONSTRAINT FK_ChatMensaje_Usuario  REFERENCES dbo.Usuario(id_usuario),
        texto               NVARCHAR(1000) NOT NULL,
        fecha               DATETIME2(0)   NOT NULL CONSTRAINT DF_ChatMensaje_fecha DEFAULT SYSUTCDATETIME(),  -- UTC
        leido               BIT            NOT NULL CONSTRAINT DF_ChatMensaje_leido DEFAULT 0,
        CONSTRAINT CK_ChatMensaje_texto CHECK (LEN(LTRIM(RTRIM(texto))) > 0)
    );
    PRINT 'Tabla ChatMensaje creada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChatMensaje_Conversacion' AND object_id = OBJECT_ID('dbo.ChatMensaje'))
    CREATE INDEX IX_ChatMensaje_Conversacion ON dbo.ChatMensaje (id_sucursal, id_cliente, id_mensaje);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChatMensaje_Cliente' AND object_id = OBJECT_ID('dbo.ChatMensaje'))
    CREATE INDEX IX_ChatMensaje_Cliente ON dbo.ChatMensaje (id_cliente, id_mensaje);
GO

/* ---------------------------------------------------------
   2. HORA DE GUATEMALA
   La base de Azure trabaja en UTC; Guatemala es UTC-6 todo el año.
   --------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_HoraGuatemala (@utc DATETIME2(0))
RETURNS DATETIME2(0)
AS
BEGIN
    RETURN CONVERT(DATETIME2(0), (@utc AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time');
END
GO

/* ---------------------------------------------------------
   3. PROCEDIMIENTOS DE LA APP (servidor Node, rutas /cliente/chat)
   --------------------------------------------------------- */

-- Mensajes del cliente. @despues = id del último que ya tiene la app
-- (0 = los últimos 100). Al leerlos, los de la sucursal quedan como leídos.
-- rs1: nombre de su sucursal | rs2: mensajes (del más viejo al más nuevo)
CREATE OR ALTER PROCEDURE dbo.usp_App_ChatListar
    @id_cliente INT,
    @despues    INT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id_sucursal INT = (SELECT id_sucursal FROM dbo.Cliente WHERE id_cliente = @id_cliente);
    IF @id_sucursal IS NULL
        THROW 50380, N'No tienes una sucursal asignada.', 1;

    SELECT nombre_sucursal AS sucursal FROM dbo.Sucursal WHERE id_sucursal = @id_sucursal;

    SELECT m.id_mensaje, m.texto,
           CONVERT(VARCHAR(19), dbo.fn_HoraGuatemala(m.fecha), 126) AS fecha,   -- "2026-10-22T18:05:00"
           m.de_cliente,
           CASE WHEN m.de_cliente = 1 THEN N'Tú'
                ELSE ISNULL(u.primer_nombre_us + N' · Recepción', N'Recepción') END AS autor,
           m.leido
    FROM (
        SELECT TOP (100) * FROM dbo.ChatMensaje
        WHERE id_cliente = @id_cliente AND id_mensaje > ISNULL(@despues, 0)
        ORDER BY id_mensaje DESC
    ) m
    LEFT JOIN dbo.Usuario u ON u.id_usuario = m.id_usuario_empleado
    ORDER BY m.id_mensaje;

    UPDATE dbo.ChatMensaje SET leido = 1
    WHERE id_cliente = @id_cliente AND de_cliente = 0 AND leido = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_App_ChatEnviar
    @id_cliente INT,
    @texto      NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;

    SET @texto = LTRIM(RTRIM(@texto));
    IF @texto IS NULL OR @texto = N''
        THROW 50381, N'Escribe un mensaje.', 1;

    DECLARE @id_sucursal INT = (SELECT id_sucursal FROM dbo.Cliente WHERE id_cliente = @id_cliente);
    IF @id_sucursal IS NULL
        THROW 50380, N'No tienes una sucursal asignada.', 1;

    -- Freno contra mensajes repetidos sin parar: máximo 20 en 10 minutos
    IF (SELECT COUNT(*) FROM dbo.ChatMensaje
        WHERE id_cliente = @id_cliente AND de_cliente = 1
          AND fecha > DATEADD(MINUTE, -10, SYSUTCDATETIME())) >= 20
        THROW 50382, N'Enviaste muchos mensajes seguidos. Espera unos minutos a que te respondan.', 1;

    DECLARE @nuevo TABLE (id_mensaje INT);
    INSERT INTO dbo.ChatMensaje (id_cliente, id_sucursal, de_cliente, texto)
    OUTPUT inserted.id_mensaje INTO @nuevo
    VALUES (@id_cliente, @id_sucursal, 1, @texto);

    SELECT m.id_mensaje, m.texto,
           CONVERT(VARCHAR(19), dbo.fn_HoraGuatemala(m.fecha), 126) AS fecha,
           m.de_cliente, N'Tú' AS autor, m.leido
    FROM dbo.ChatMensaje m JOIN @nuevo n ON n.id_mensaje = m.id_mensaje;
END
GO

-- Cuántos mensajes de la sucursal no ha leído (globito en perfil.tsx)
CREATE OR ALTER PROCEDURE dbo.usp_App_ChatSinLeer
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS sin_leer FROM dbo.ChatMensaje
    WHERE id_cliente = @id_cliente AND de_cliente = 0 AND leido = 0;
END
GO

/* ---------------------------------------------------------
   4. PROCEDIMIENTOS DEL ESCRITORIO (PRINCIPAL.py → conexion_bd.py)
   --------------------------------------------------------- */

-- Lista de conversaciones de la sucursal, la más reciente primero
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ChatConversaciones
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT c.id_cliente,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS cliente,
           ult.texto AS ultimo_texto,
           ult.de_cliente AS ultimo_de_cliente,
           dbo.fn_HoraGuatemala(ult.fecha) AS ultima_fecha,
           ISNULL(nl.sin_leer, 0) AS sin_leer
    FROM (SELECT DISTINCT id_cliente FROM dbo.ChatMensaje WHERE id_sucursal = @id_sucursal) cv
    JOIN dbo.Cliente c ON c.id_cliente = cv.id_cliente
    JOIN dbo.Usuario u ON u.id_usuario = c.id_usuario
    CROSS APPLY (
        SELECT TOP 1 texto, de_cliente, fecha FROM dbo.ChatMensaje
        WHERE id_sucursal = @id_sucursal AND id_cliente = cv.id_cliente
        ORDER BY id_mensaje DESC
    ) ult
    OUTER APPLY (
        SELECT COUNT(*) AS sin_leer FROM dbo.ChatMensaje
        WHERE id_sucursal = @id_sucursal AND id_cliente = cv.id_cliente AND de_cliente = 1 AND leido = 0
    ) nl
    ORDER BY ult.fecha DESC;
END
GO

-- Mensajes con un cliente. Al leerlos, los del cliente quedan como leídos.
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ChatMensajes
    @id_sucursal INT,
    @id_cliente  INT,
    @despues     INT = 0
AS
BEGIN
    SET NOCOUNT ON;

    SELECT m.id_mensaje, m.texto, dbo.fn_HoraGuatemala(m.fecha) AS fecha, m.de_cliente, m.leido,
           CASE WHEN m.de_cliente = 1 THEN uc.primer_nombre_us + ' ' + uc.primer_apellido_us
                ELSE ISNULL(ue.primer_nombre_us + ' ' + ue.primer_apellido_us, 'Recepción') END AS autor
    FROM (
        SELECT TOP (200) * FROM dbo.ChatMensaje
        WHERE id_sucursal = @id_sucursal AND id_cliente = @id_cliente AND id_mensaje > ISNULL(@despues, 0)
        ORDER BY id_mensaje DESC
    ) m
    JOIN dbo.Cliente c       ON c.id_cliente  = m.id_cliente
    JOIN dbo.Usuario uc      ON uc.id_usuario = c.id_usuario
    LEFT JOIN dbo.Usuario ue ON ue.id_usuario = m.id_usuario_empleado
    ORDER BY m.id_mensaje;

    UPDATE dbo.ChatMensaje SET leido = 1
    WHERE id_sucursal = @id_sucursal AND id_cliente = @id_cliente AND de_cliente = 1 AND leido = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ChatEnviar
    @id_sucursal INT,
    @id_cliente  INT,
    @id_usuario  INT,
    @texto       NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;

    SET @texto = LTRIM(RTRIM(@texto));
    IF @texto IS NULL OR @texto = N''
        THROW 50381, N'Escribe un mensaje.', 1;
    -- Se puede escribir a un cliente de esta sucursal, o a uno que ya escribió aquí
    IF NOT EXISTS (SELECT 1 FROM dbo.Cliente WHERE id_cliente = @id_cliente AND id_sucursal = @id_sucursal)
       AND NOT EXISTS (SELECT 1 FROM dbo.ChatMensaje WHERE id_cliente = @id_cliente AND id_sucursal = @id_sucursal)
        THROW 50383, N'Ese cliente no es de esta sucursal.', 1;

    DECLARE @nuevo TABLE (id_mensaje INT);
    INSERT INTO dbo.ChatMensaje (id_cliente, id_sucursal, de_cliente, id_usuario_empleado, texto)
    OUTPUT inserted.id_mensaje INTO @nuevo
    VALUES (@id_cliente, @id_sucursal, 0, @id_usuario, @texto);

    SELECT id_mensaje FROM @nuevo;
END
GO

-- Total de mensajes de clientes sin leer (número en el botón del menú)
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ChatSinLeer
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS sin_leer FROM dbo.ChatMensaje
    WHERE id_sucursal = @id_sucursal AND de_cliente = 1 AND leido = 0;
END
GO

/* ---------------------------------------------------------
   5. PERMISOS
   - Servidor Node (FitManager / fitmanager_servidor): los de la app
   - Escritorio (rol_app_sucursal): los del escritorio
   En Azure, si ya tienen EXECUTE sobre dbo, esto no cambia nada.
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_App_ChatListar TO '  + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_ChatEnviar TO '  + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_ChatSinLeer TO ' + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos de la app concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;

IF DATABASE_PRINCIPAL_ID('rol_app_sucursal') IS NOT NULL
BEGIN
    EXEC (N'GRANT EXECUTE ON dbo.usp_Escritorio_ChatConversaciones TO rol_app_sucursal; '
        + N'GRANT EXECUTE ON dbo.usp_Escritorio_ChatMensajes TO rol_app_sucursal; '
        + N'GRANT EXECUTE ON dbo.usp_Escritorio_ChatEnviar TO rol_app_sucursal; '
        + N'GRANT EXECUTE ON dbo.usp_Escritorio_ChatSinLeer TO rol_app_sucursal;');
    PRINT 'Permisos del escritorio concedidos a: rol_app_sucursal';
END
ELSE
    PRINT 'No existe rol_app_sucursal: concede EXECUTE de los usp_Escritorio_Chat* al usuario del escritorio.';
GO

SELECT name AS objeto, type_desc FROM sys.objects
WHERE name IN ('ChatMensaje', 'fn_HoraGuatemala',
               'usp_App_ChatListar', 'usp_App_ChatEnviar', 'usp_App_ChatSinLeer',
               'usp_Escritorio_ChatConversaciones', 'usp_Escritorio_ChatMensajes',
               'usp_Escritorio_ChatEnviar', 'usp_Escritorio_ChatSinLeer');
GO

SET NOEXEC OFF;
GO
