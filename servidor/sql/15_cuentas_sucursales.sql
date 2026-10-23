/* =========================================================
   15_cuentas_sucursales.sql — UNA CUENTA DE RECEPCIÓN POR SUCURSAL
   Ejecutar en la base FitManager con el usuario ADMINISTRADOR (adminfit).
   Se puede ejecutar más de una vez: las sucursales que ya tienen
   cuenta se saltan (sirve cuando se agrega una sucursal nueva).

   Crea, para cada fila de la tabla Sucursal:
     - usuario  recepcion.<sucursal>   (ej: recepcion.zona11)
     - rol      Recepción (o uno de personal que ya exista)
   y al final MUESTRA las contraseñas: CÓPIALAS EN ESE MOMENTO.

   Sobre el cifrado:
     SQL Server no puede calcular Argon2, así que la contraseña se guarda
     con SHA-256 + sal (el método anterior, el mismo de usp_ValidarLogin).
     La PRIMERA vez que la cuenta inicia sesión (app de escritorio o app
     móvil), el sistema la pasa a Argon2 y borra el hash SHA-256.
     → Que cada sucursal inicie sesión una vez lo antes posible.

   Contraseñas:
     @clave_comun = NULL  → se genera una distinta para cada sucursal (recomendado)
     @clave_comun = '...' → la misma para todas (mínimo 8 caracteres, SIN tildes ni ñ)
   ========================================================= */

DECLARE @clave_comun VARCHAR(100) = NULL;      -- ← cámbiala aquí si quieres una sola para todas

/* ---------------------------------------------------------
   0. REVISIONES
   --------------------------------------------------------- */
SET NOCOUNT ON;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cámbiala en la lista de arriba de SSMS.', 16, 1, @base_actual);
    RETURN;
END
IF COL_LENGTH('dbo.AliasUsuario', 'contrasena_argon2') IS NULL OR OBJECT_ID('dbo.usp_ValidarLogin', 'P') IS NULL
BEGIN
    RAISERROR('Falta 01_argon2.sql o usp_ValidarLogin en esta base.', 16, 1);
    RETURN;
END
IF @clave_comun IS NOT NULL AND LEN(@clave_comun) < 8
BEGIN
    RAISERROR('@clave_comun debe tener al menos 8 caracteres.', 16, 1);
    RETURN;
END

/* ---------------------------------------------------------
   1. DATOS QUE PIDE LA TABLA Usuario
      Las cuentas de sucursal no son personas reales: se usan los
      primeros valores de cada catálogo.
   --------------------------------------------------------- */
DECLARE @id_genero INT = (SELECT MIN(id_genero) FROM dbo.Genero);
DECLARE @id_estado INT = (SELECT id_estado FROM dbo.Estado WHERE nombre_estado = 'Activo');
DECLARE @id_pais   INT = (SELECT id_pais FROM dbo.Pais WHERE nombre_pais = 'Guatemala');
DECLARE @id_municipio INT, @id_departamento INT;
SELECT TOP 1 @id_municipio = id_municipio, @id_departamento = id_departamento
FROM dbo.Municipio
ORDER BY CASE WHEN nombre_municipio = 'Guatemala' THEN 0 ELSE 1 END, id_municipio;

IF @id_genero IS NULL OR @id_estado IS NULL OR @id_municipio IS NULL
BEGIN
    RAISERROR('Faltan datos en Genero, Estado (''Activo'') o Municipio.', 16, 1);
    RETURN;
END

/* ---------------------------------------------------------
   2. ROL DE PERSONAL (para que puedan entrar a la app de escritorio)
   --------------------------------------------------------- */
DECLARE @id_rol INT, @nombre_rol VARCHAR(30);
SELECT TOP 1 @id_rol = id_rol, @nombre_rol = nombre_rol
FROM dbo.Rol
WHERE nombre_rol IN ('Recepción', 'Recepcion', 'Recepcionista', 'Administrador', 'Admin')
ORDER BY CASE nombre_rol WHEN 'Recepción' THEN 1 WHEN 'Recepcion' THEN 2 WHEN 'Recepcionista' THEN 3
                         WHEN 'Administrador' THEN 4 ELSE 5 END;
IF @id_rol IS NULL
BEGIN
    INSERT INTO dbo.Rol (nombre_rol) VALUES ('Recepción');
    SELECT @id_rol = SCOPE_IDENTITY(), @nombre_rol = 'Recepción';
    PRINT 'Se creó el rol Recepción.';
END

/* ---------------------------------------------------------
   3. UNA CUENTA POR SUCURSAL
   --------------------------------------------------------- */
DECLARE @resultado TABLE (
    id_sucursal INT, sucursal VARCHAR(100), usuario VARCHAR(60), contrasena VARCHAR(100), resultado NVARCHAR(400));

DECLARE @id_sucursal INT, @sucursal VARCHAR(100), @alias VARCHAR(60), @nit VARCHAR(20),
        @clave VARCHAR(100), @g VARCHAR(32), @salt UNIQUEIDENTIFIER, @hash VARBINARY(32), @id_usuario INT;

DECLARE sucursales CURSOR LOCAL FAST_FORWARD FOR
    SELECT id_sucursal, nombre_sucursal FROM dbo.Sucursal ORDER BY id_sucursal;
OPEN sucursales;
FETCH NEXT FROM sucursales INTO @id_sucursal, @sucursal;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- 'Zona 11' -> 'recepcion.zona11' (sin tildes, espacios ni signos)
    SET @alias = LOWER(CAST(CAST(@sucursal AS NVARCHAR(100)) COLLATE SQL_Latin1_General_CP1253_CI_AI AS VARCHAR(100)));
    SET @alias = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                     @alias, ' ', ''), '.', ''), '-', ''), ',', ''), '#', ''), '''', ''), '(', ''), ')', '');
    SET @alias = LEFT('recepcion.' + @alias, 60);
    SET @nit = 'EMP-SUC-' + CAST(@id_sucursal AS VARCHAR(10));   -- identificador único (no es un DPI real)

    IF EXISTS (SELECT 1 FROM dbo.AliasUsuario WHERE alias = @alias)
        INSERT INTO @resultado VALUES (@id_sucursal, @sucursal, @alias, NULL, N'Ya existía: no se cambió');
    ELSE IF EXISTS (SELECT 1 FROM dbo.Usuario WHERE nit_dpi = @nit)
        INSERT INTO @resultado VALUES (@id_sucursal, @sucursal, @alias, NULL, N'Ya hay un usuario con nit_dpi ' + @nit);
    ELSE
    BEGIN
        -- Contraseña: la común o una aleatoria tipo 'Fit-3fa9-C21B-47'
        SET @g = REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', '');
        SET @clave = ISNULL(@clave_comun,
                     'Fit-' + LOWER(SUBSTRING(@g, 1, 4)) + '-' + SUBSTRING(@g, 5, 4) + '-'
                            + CAST(ABS(CHECKSUM(NEWID())) % 90 + 10 AS VARCHAR(2)));

        -- Mismo cálculo que usp_RegistrarContrasena / usp_ValidarLogin
        SET @salt = NEWID();
        SET @hash = HASHBYTES('SHA2_256', @clave + CAST(@salt AS VARCHAR(36)));

        BEGIN TRY
            BEGIN TRANSACTION;

            INSERT INTO dbo.Usuario (id_genero, primer_nombre_us, primer_apellido_us, fecha_nacimiento_us,
                                     id_departamento, id_municipio, id_pais, nit_dpi, id_estado)
            VALUES (@id_genero, 'Recepción', LEFT(@sucursal, 50), '2000-01-01',
                    @id_departamento, @id_municipio, @id_pais, @nit, @id_estado);
            SET @id_usuario = SCOPE_IDENTITY();

            INSERT INTO dbo.AliasUsuario (id_usuario, alias, contrasena_hash, contrasena_salt, fecha_registro)
            VALUES (@id_usuario, @alias, @hash, @salt, GETDATE());

            INSERT INTO dbo.UsuarioRol (id_usuario, id_rol) VALUES (@id_usuario, @id_rol);

            COMMIT TRANSACTION;
            INSERT INTO @resultado VALUES (@id_sucursal, @sucursal, @alias, @clave, N'Creada');
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            INSERT INTO @resultado VALUES (@id_sucursal, @sucursal, @alias, NULL, N'Error: ' + ERROR_MESSAGE());
        END CATCH
    END

    FETCH NEXT FROM sucursales INTO @id_sucursal, @sucursal;
END
CLOSE sucursales;
DEALLOCATE sucursales;

/* ---------------------------------------------------------
   4. RESULTADO — copia las contraseñas AHORA
      ID_SUCURSAL es el número que va en escritorio.env de cada computadora.
   --------------------------------------------------------- */
SELECT id_sucursal AS ID_SUCURSAL, sucursal, usuario, contrasena, resultado, @nombre_rol AS rol
FROM @resultado
ORDER BY id_sucursal;
