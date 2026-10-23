/* =========================================================
   10_recuperacion_correo.sql — RECUPERAR LA CONTRASEÑA CON UN CÓDIGO POR CORREO
   Ejecutar en la base FitManager (Azure y copias locales).
   Se puede ejecutar más de una vez sin errores ni pérdida de datos.

   Flujo:
     1. La app manda el alias (trama CODIGO_ENVIAR).
     2. Node busca el correo, genera un código de 6 dígitos, guarda SOLO
        su hash Argon2 aquí y envía el código por correo.
     3. La app manda alias + código + contraseña nueva (trama CODIGO_VERIFICAR).
     4. Node compara el código con el hash; si coincide, cambia la
        contraseña (usp_GuardarContrasenaArgon2) y el código queda usado.

   Reglas que aplica la base:
     - Cada código vence a los 10 minutos y sirve UNA sola vez.
     - Máximo 5 intentos por código; al quinto fallo queda anulado.
     - Máximo 3 códigos por alias cada 15 minutos (evita llenar de
       correos a otra persona).
     - Pedir un código nuevo anula los anteriores.

   Crea:
     - Tabla CodigoRecuperacion
     - usp_ObtenerCorreoRecuperacion   → correo y nombre del alias
     - usp_GuardarCodigoRecuperacion   → guarda el hash del código nuevo
     - usp_ObtenerCodigoRecuperacion   → el código vigente del alias
     - usp_RegistrarIntentoCodigo      → suma un intento o lo marca usado

   Errores: números 50400 a 50419 (THROW).
   Las fechas se guardan en UTC (SYSUTCDATETIME) para no depender de la
   zona horaria del servidor de Azure.
   ========================================================= */

/* ---------------------------------------------------------
   0. ¿ESTAMOS EN LA BASE CORRECTA?
   --------------------------------------------------------- */
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
      Guarda la HUELLA (hash) del código, nunca el código.
   --------------------------------------------------------- */
IF OBJECT_ID('dbo.CodigoRecuperacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CodigoRecuperacion (
        id_codigo       INT IDENTITY(1,1) NOT NULL,
        id_alias        INT          NOT NULL,
        codigo_hash     VARCHAR(255) NOT NULL,
        fecha_creacion  DATETIME2(0) NOT NULL CONSTRAINT DF_CodigoRecuperacion_creacion DEFAULT SYSUTCDATETIME(),
        fecha_expira    DATETIME2(0) NOT NULL,
        intentos        INT          NOT NULL CONSTRAINT DF_CodigoRecuperacion_intentos DEFAULT 0,
        usado           BIT          NOT NULL CONSTRAINT DF_CodigoRecuperacion_usado DEFAULT 0,
        CONSTRAINT PK_CodigoRecuperacion PRIMARY KEY (id_codigo),
        CONSTRAINT FK_CodigoRecuperacion_Alias FOREIGN KEY (id_alias) REFERENCES dbo.AliasUsuario (id_alias),
        CONSTRAINT CK_CodigoRecuperacion_intentos CHECK (intentos >= 0)
    );

    -- Para encontrar rápido el código más reciente de un alias
    CREATE INDEX IX_CodigoRecuperacion_alias
        ON dbo.CodigoRecuperacion (id_alias, fecha_creacion DESC);

    PRINT 'Tabla CodigoRecuperacion creada.';
END
ELSE
    PRINT 'La tabla CodigoRecuperacion ya existía: no se modificó.';
GO

/* ---------------------------------------------------------
   2. CORREO DE RECUPERACIÓN DEL ALIAS
      Si el alias no existe o no tiene correo, no devuelve filas.
      (Node responde lo mismo en ambos casos, para no revelar
      qué alias existen.)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ObtenerCorreoRecuperacion
    @alias VARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT a.id_alias,
           a.correo_recuperacion,
           u.primer_nombre_us AS nombre
    FROM AliasUsuario a
    JOIN Usuario u ON u.id_usuario = a.id_usuario
    WHERE a.alias = @alias
      AND a.correo_recuperacion IS NOT NULL
      AND LTRIM(RTRIM(a.correo_recuperacion)) <> '';
END
GO

/* ---------------------------------------------------------
   3. GUARDAR UN CÓDIGO NUEVO
      - Revisa el límite de 3 códigos cada 15 minutos.
      - Anula los códigos anteriores que sigan vigentes.
      - Borra los códigos con más de 1 día (limpieza).
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_GuardarCodigoRecuperacion
    @id_alias     INT,
    @codigo_hash  VARCHAR(255),
    @minutos      INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM AliasUsuario WHERE id_alias = @id_alias)
        THROW 50400, N'El usuario no existe.', 1;
    IF @minutos IS NULL OR @minutos < 1 OR @minutos > 60
        THROW 50401, N'La vigencia del código debe ser de 1 a 60 minutos.', 1;

    DECLARE @ahora DATETIME2(0) = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Límite de envíos (con bloqueo, para que dos toques seguidos cuenten bien)
        IF (SELECT COUNT(*) FROM CodigoRecuperacion WITH (UPDLOCK, HOLDLOCK)
            WHERE id_alias = @id_alias
              AND fecha_creacion > DATEADD(MINUTE, -15, @ahora)) >= 3
            THROW 50402, N'Ya pediste varios códigos. Espera 15 minutos e intenta de nuevo.', 1;

        -- Solo vale el código más reciente
        UPDATE CodigoRecuperacion SET usado = 1
        WHERE id_alias = @id_alias AND usado = 0;

        INSERT INTO CodigoRecuperacion (id_alias, codigo_hash, fecha_creacion, fecha_expira)
        VALUES (@id_alias, @codigo_hash, @ahora, DATEADD(MINUTE, @minutos, @ahora));

        -- Limpieza: los códigos viejos ya no sirven para nada
        DELETE FROM CodigoRecuperacion
        WHERE fecha_expira < DATEADD(DAY, -1, @ahora);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   4. CÓDIGO VIGENTE DEL ALIAS
      Solo devuelve un código que no se ha usado, no ha vencido y
      tiene menos de 5 intentos. Si no hay, no devuelve filas.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ObtenerCodigoRecuperacion
    @alias VARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1 c.id_codigo, c.id_alias, c.codigo_hash, c.intentos
    FROM CodigoRecuperacion c
    JOIN AliasUsuario a ON a.id_alias = c.id_alias
    WHERE a.alias = @alias
      AND c.usado = 0
      AND c.intentos < 5
      AND c.fecha_expira > SYSUTCDATETIME()
    ORDER BY c.fecha_creacion DESC, c.id_codigo DESC;
END
GO

/* ---------------------------------------------------------
   5. REGISTRAR UN INTENTO
      @exitoso = 1 → el código queda usado (no sirve otra vez)
      @exitoso = 0 → suma un intento; al quinto queda anulado
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_RegistrarIntentoCodigo
    @id_codigo INT,
    @exitoso   BIT
AS
BEGIN
    SET NOCOUNT ON;

    IF @exitoso = 1
        UPDATE CodigoRecuperacion SET usado = 1
        WHERE id_codigo = @id_codigo;
    ELSE
        UPDATE CodigoRecuperacion
        SET intentos = intentos + 1,
            usado    = CASE WHEN intentos + 1 >= 5 THEN 1 ELSE usado END
        WHERE id_codigo = @id_codigo;

    -- Intentos que le quedan (0 si ya se anuló)
    SELECT CASE WHEN usado = 1 THEN 0 ELSE 5 - intentos END AS intentos_restantes
    FROM CodigoRecuperacion
    WHERE id_codigo = @id_codigo;
END
GO

/* ---------------------------------------------------------
   6. PERMISOS
      En Azure, fitmanager_servidor ya tiene EXECUTE sobre todo el
      esquema dbo; esto cubre también las copias locales.
      La tabla NO se da a nadie: solo se usa por los procedimientos.
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor', 'usuario_app');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_ObtenerCorreoRecuperacion TO ' + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_GuardarCodigoRecuperacion TO ' + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_ObtenerCodigoRecuperacion TO ' + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_RegistrarIntentoCodigo TO '    + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* ---------------------------------------------------------
   7. REVISIÓN: deben salir la tabla y los 4 procedimientos
   --------------------------------------------------------- */
SELECT name AS objeto, type_desc AS tipo
FROM sys.objects
WHERE name IN ('CodigoRecuperacion', 'usp_ObtenerCorreoRecuperacion', 'usp_GuardarCodigoRecuperacion',
               'usp_ObtenerCodigoRecuperacion', 'usp_RegistrarIntentoCodigo')
ORDER BY type_desc, name;
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
