/* =============================================================
   01_argon2.sql — CONTRASEÑAS Y PALABRA CLAVE CON ARGON2
   Ejecutar en SSMS sobre la base FitManager (Ctrl + A, luego Ejecutar).
   Se puede ejecutar más de una vez sin errores.

   Qué cambia:
     - El SERVIDOR calcula y compara los hash con Argon2id.
       La base solo GUARDA el texto Argon2 (nunca la contraseña).
     - Columnas nuevas: AliasUsuario.contrasena_argon2 y
       RespuestaSeguridad.respuesta_argon2.
     - Las columnas viejas (SHA-256) quedan permitiendo NULL: cuando un
       usuario pasa a Argon2, su hash viejo se BORRA.
     - Procedimientos nuevos para que el servidor lea y guarde hashes
       sin tener permiso directo sobre las tablas.
   ============================================================= */
USE FitManager;
GO

/* -------------------------------------------------------------
   1. COLUMNAS
   Un hash Argon2id es un texto de unos 100 caracteres, por ejemplo:
   $argon2id$v=19$m=19456,t=2,p=1$<sal>$<hash>
   ------------------------------------------------------------- */
IF COL_LENGTH('dbo.AliasUsuario', 'contrasena_argon2') IS NULL
    ALTER TABLE dbo.AliasUsuario ADD contrasena_argon2 VARCHAR(255) NULL;
GO
-- El hash viejo ya no es obligatorio: se borra al pasar a Argon2
ALTER TABLE dbo.AliasUsuario ALTER COLUMN contrasena_hash VARBINARY(32) NULL;
GO

IF COL_LENGTH('dbo.RespuestaSeguridad', 'respuesta_argon2') IS NULL
    ALTER TABLE dbo.RespuestaSeguridad ADD respuesta_argon2 VARCHAR(255) NULL;
GO
ALTER TABLE dbo.RespuestaSeguridad ALTER COLUMN respuesta_hash VARBINARY(32) NULL;
GO

/* -------------------------------------------------------------
   2. LEER LA CREDENCIAL DE UN ALIAS
   Devuelve el hash Argon2 (si ya lo tiene) y si todavía tiene el
   hash viejo SHA-256 (para migrarlo cuando inicie sesión).
   Si el alias no existe, no devuelve filas.
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ObtenerCredencial
    @alias VARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT id_alias,
           contrasena_argon2,
           CAST(CASE WHEN contrasena_hash IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS tiene_hash_viejo
    FROM dbo.AliasUsuario
    WHERE alias = @alias;
END
GO

/* -------------------------------------------------------------
   3. GUARDAR UNA CONTRASEÑA EN ARGON2
   Recibe el hash ya calculado por el servidor y BORRA el hash viejo.
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_GuardarContrasenaArgon2
    @id_alias          INT,
    @contrasena_argon2 VARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    IF @contrasena_argon2 IS NULL OR @contrasena_argon2 NOT LIKE '$argon2id$%'
        THROW 50100, 'El hash de la contraseña no tiene formato Argon2id.', 1;

    UPDATE dbo.AliasUsuario
    SET contrasena_argon2 = @contrasena_argon2,
        contrasena_hash   = NULL          -- solo Argon2: el SHA-256 se elimina
    WHERE id_alias = @id_alias;

    IF @@ROWCOUNT = 0
        THROW 50101, 'El usuario no existe.', 1;
END
GO

/* -------------------------------------------------------------
   4. REGISTRAR UN INTENTO DE INICIO DE SESIÓN EN LoginLog
   (usp_ValidarLogin lo hacía solo; con Argon2 lo pide el servidor)
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_RegistrarIntentoLogin
    @id_alias  INT,
    @resultado VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    IF @resultado NOT IN ('Exitoso', 'Fallido')
        THROW 50103, 'El resultado debe ser Exitoso o Fallido.', 1;

    INSERT INTO dbo.LoginLog (id_alias, fecha_registro_log, resultado)
    VALUES (@id_alias, GETDATE(), @resultado);
END
GO

/* -------------------------------------------------------------
   5. LEER LAS PALABRAS CLAVE (ARGON2) DE UN ALIAS
   Solo las que ya están en Argon2. Si no hay, no devuelve filas.
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ObtenerRespuestasSeguridad
    @alias VARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT a.id_alias, r.id_pregunta, r.respuesta_argon2
    FROM dbo.AliasUsuario a
    JOIN dbo.RespuestaSeguridad r ON r.id_alias = a.id_alias
    WHERE a.alias = @alias
      AND r.respuesta_argon2 IS NOT NULL;
END
GO

/* -------------------------------------------------------------
   6. GUARDAR (O CAMBIAR) LA PALABRA CLAVE
   Si no se indica la pregunta, usa la primera de PreguntaSeguridad.
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_GuardarRespuestaSeguridad
    @id_alias         INT,
    @id_pregunta      INT = NULL,
    @respuesta_argon2 VARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    IF @respuesta_argon2 IS NULL OR @respuesta_argon2 NOT LIKE '$argon2id$%'
        THROW 50100, 'El hash de la palabra clave no tiene formato Argon2id.', 1;

    IF @id_pregunta IS NULL
        SELECT @id_pregunta = MIN(id_pregunta) FROM dbo.PreguntaSeguridad;

    IF @id_pregunta IS NULL
       OR NOT EXISTS (SELECT 1 FROM dbo.PreguntaSeguridad WHERE id_pregunta = @id_pregunta)
        THROW 50102, 'La pregunta de seguridad no existe.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.AliasUsuario WHERE id_alias = @id_alias)
        THROW 50101, 'El usuario no existe.', 1;

    IF EXISTS (SELECT 1 FROM dbo.RespuestaSeguridad
               WHERE id_alias = @id_alias AND id_pregunta = @id_pregunta)
        UPDATE dbo.RespuestaSeguridad
        SET respuesta_argon2 = @respuesta_argon2,
            respuesta_hash   = NULL
        WHERE id_alias = @id_alias AND id_pregunta = @id_pregunta;
    ELSE
        INSERT INTO dbo.RespuestaSeguridad (id_alias, id_pregunta, respuesta_hash, respuesta_argon2)
        VALUES (@id_alias, @id_pregunta, NULL, @respuesta_argon2);
END
GO

/* -------------------------------------------------------------
   7. LISTA DE PREGUNTAS DE SEGURIDAD (para la pantalla de la app)
   ------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ListarPreguntasSeguridad
AS
BEGIN
    SET NOCOUNT ON;
    SELECT id_pregunta, texto_pregunta
    FROM dbo.PreguntaSeguridad
    ORDER BY id_pregunta;
END
GO

/* -------------------------------------------------------------
   8. PERMISOS
   Se dan al usuario con el que entra el servidor. En la copia local
   de Fredy es "FitManager"; en la base real será "fitmanager_servidor".
   Solo se aplica al que exista.
   ------------------------------------------------------------- */
DECLARE @usuario SYSNAME, @sql NVARCHAR(MAX);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'
        GRANT EXECUTE ON dbo.usp_ValidarLogin               TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_ObtenerCredencial          TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_GuardarContrasenaArgon2    TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_RegistrarIntentoLogin      TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_ObtenerRespuestasSeguridad TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_GuardarRespuestaSeguridad  TO ' + QUOTENAME(@usuario) + N';
        GRANT EXECUTE ON dbo.usp_ListarPreguntasSeguridad   TO ' + QUOTENAME(@usuario) + N';';
    EXEC sp_executesql @sql;
    PRINT 'Permisos dados a ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* -------------------------------------------------------------
   9. REVISIÓN RÁPIDA
   ------------------------------------------------------------- */
SELECT 'contrasena_argon2' AS columna_nueva, COL_LENGTH('dbo.AliasUsuario', 'contrasena_argon2') AS largo
UNION ALL
SELECT 'respuesta_argon2', COL_LENGTH('dbo.RespuestaSeguridad', 'respuesta_argon2');
SELECT name AS procedimiento FROM sys.procedures
WHERE name IN ('usp_ObtenerCredencial', 'usp_GuardarContrasenaArgon2', 'usp_RegistrarIntentoLogin',
               'usp_ObtenerRespuestasSeguridad', 'usp_GuardarRespuestaSeguridad', 'usp_ListarPreguntasSeguridad')
ORDER BY name;
GO
