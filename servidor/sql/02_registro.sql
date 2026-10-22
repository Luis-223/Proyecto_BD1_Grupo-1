/* =========================================================
   02_registro.sql — REGISTRO DE CLIENTES DESDE LA APP
   Ejecutar en la base FitManager (después de 01_argon2.sql).

   Crea:
     - usp_ListarCatalogos   → listas para la pantalla de registro (trama CATALOGOS)
     - usp_RegistrarCliente  → crea la cuenta completa en una transacción (trama SIGNUP)
   Y da permiso de EXECUTE al mismo usuario que ya ejecuta usp_ObtenerCredencial
   (el usuario con el que se conecta el servidor Node).

   Las contraseñas y palabras clave llegan YA cifradas con Argon2 desde Node:
   SQL Server nunca ve la contraseña real.
   ========================================================= */

/* ---------------------------------------------------------
   1. CATÁLOGOS PARA LA APP
      Cada SELECT es una tabla de resultados distinta, EN ESTE ORDEN
      (servicios/cuentas.js → listarCatalogos las lee por posición).
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_ListarCatalogos
AS
BEGIN
    SET NOCOUNT ON;
    SELECT id_genero AS id, nombre_genero AS nombre FROM Genero ORDER BY id_genero;                                  -- 0
    SELECT id_departamento AS id, nombre_departamento AS nombre FROM Departamento ORDER BY nombre_departamento;       -- 1
    SELECT id_municipio AS id, id_departamento, nombre_municipio AS nombre FROM Municipio ORDER BY nombre_municipio;  -- 2
    SELECT id_sucursal AS id, nombre_sucursal AS nombre FROM Sucursal ORDER BY nombre_sucursal;                      -- 3
    SELECT id_metodo_pago AS id, nombre_metodo AS nombre FROM MetodoPago ORDER BY id_metodo_pago;                    -- 4
    SELECT id_tipo_membresia AS id, nombre_tipo AS nombre, precio_base AS precio, duracion_meses AS duracion
    FROM TipoMembresia ORDER BY precio_base;                                                                         -- 5
    SELECT id_pregunta AS id, texto_pregunta AS nombre FROM PreguntaSeguridad ORDER BY id_pregunta;                  -- 6
END
GO

/* ---------------------------------------------------------
   2. REGISTRAR UN CLIENTE
      Dos caminos:
        - Paga ahora (@id_metodo_pago con valor): estado Activo y se factura
          la membresía con usp_FacturarMembresia.
        - Paga en la sucursal (@id_metodo_pago NULL): estado Inactivo
          (acceso LIMITADO en la app) y no se factura nada.
      Todo ocurre en UNA transacción: o se guarda todo, o nada.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_RegistrarCliente
    @alias              VARCHAR(60),
    @correo             VARCHAR(100),
    @telefono           VARCHAR(20),
    @contrasena_argon2  VARCHAR(255),
    @primer_nombre      VARCHAR(50),
    @segundo_nombre     VARCHAR(50) = NULL,
    @primer_apellido    VARCHAR(50),
    @segundo_apellido   VARCHAR(50) = NULL,
    @fecha_nacimiento   DATE,
    @id_genero          INT,
    @nit_dpi            VARCHAR(20),
    @id_departamento    INT,
    @id_municipio       INT,
    @id_sucursal        INT,
    @id_metodo_pago     INT = NULL,       -- NULL = pagará en la sucursal
    @id_tipo_membresia  INT = NULL,
    @meses              INT = NULL,
    @id_pregunta        INT,
    @respuesta_argon2   VARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;    -- Ante cualquier error, deshacer TODO

    DECLARE @paga_ahora BIT = CASE WHEN @id_metodo_pago IS NULL THEN 0 ELSE 1 END;
    DECLARE @msg NVARCHAR(200);

    /* 2.1 Duplicados */
    IF EXISTS (SELECT 1 FROM AliasUsuario WHERE alias = @alias)
        THROW 50010, 'Ese nombre de usuario ya está en uso.', 1;
    IF EXISTS (SELECT 1 FROM AliasUsuario WHERE correo_recuperacion = @correo)
        THROW 50011, 'Ese correo ya está registrado.', 1;
    IF EXISTS (SELECT 1 FROM Usuario WHERE nit_dpi = @nit_dpi)
        THROW 50012, 'Ya existe una cuenta con ese DPI/NIT.', 1;

    /* 2.2 Catálogos: ¿existen los ids que mandó la app? */
    IF NOT EXISTS (SELECT 1 FROM Genero WHERE id_genero = @id_genero)
        THROW 50013, 'El género no es válido.', 1;
    IF NOT EXISTS (SELECT 1 FROM Municipio
                   WHERE id_municipio = @id_municipio AND id_departamento = @id_departamento)
        THROW 50014, 'El municipio no pertenece a ese departamento.', 1;
    IF NOT EXISTS (SELECT 1 FROM Sucursal WHERE id_sucursal = @id_sucursal)
        THROW 50015, 'La sucursal no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM PreguntaSeguridad WHERE id_pregunta = @id_pregunta)
        THROW 50018, 'La pregunta de seguridad no existe.', 1;

    IF @paga_ahora = 1
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM MetodoPago WHERE id_metodo_pago = @id_metodo_pago)
            THROW 50016, 'El método de pago no es válido.', 1;
        IF NOT EXISTS (SELECT 1 FROM TipoMembresia WHERE id_tipo_membresia = @id_tipo_membresia)
            THROW 50017, 'El tipo de membresía no existe.', 1;
        IF @meses IS NULL OR @meses < 1 OR @meses > 12
            THROW 50021, 'Se pueden pagar entre 1 y 12 meses.', 1;
    END

    /* 2.3 Valores fijos */
    DECLARE @nombre_estado VARCHAR(30) = CASE WHEN @paga_ahora = 1 THEN 'Activo' ELSE 'Inactivo' END;
    DECLARE @id_estado INT = (SELECT id_estado FROM Estado WHERE nombre_estado = @nombre_estado);
    IF @id_estado IS NULL
    BEGIN
        SET @msg = N'No existe el estado "' + @nombre_estado + N'" en la tabla Estado.';
        THROW 50019, @msg, 1;
    END

    DECLARE @id_rol INT = (SELECT id_rol FROM Rol WHERE nombre_rol = 'Cliente');
    IF @id_rol IS NULL THROW 50020, 'No existe el rol "Cliente" en la tabla Rol.', 1;

    DECLARE @id_pais INT = (SELECT id_pais FROM Pais WHERE nombre_pais = 'Guatemala');
    DECLARE @id_usuario INT, @id_alias INT, @id_cliente INT;

    /* 2.4 Transacción */
    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO Usuario (id_genero, primer_nombre_us, segundo_nombre_us, primer_apellido_us,
                             segundo_apellido_us, fecha_nacimiento_us, id_departamento,
                             id_municipio, id_pais, nit_dpi, id_estado)
        VALUES (@id_genero, @primer_nombre, @segundo_nombre, @primer_apellido,
                @segundo_apellido, @fecha_nacimiento, @id_departamento,
                @id_municipio, @id_pais, @nit_dpi, @id_estado);
        SET @id_usuario = SCOPE_IDENTITY();

        -- contrasena_salt no acepta NULL (viene de la época de SHA-256): NEWID() solo la llena
        INSERT INTO AliasUsuario (id_usuario, alias, correo_recuperacion, telefono,
                                  contrasena_salt, fecha_registro, contrasena_argon2)
        VALUES (@id_usuario, @alias, @correo, @telefono, NEWID(), GETDATE(), @contrasena_argon2);
        SET @id_alias = SCOPE_IDENTITY();

        INSERT INTO Cliente (id_usuario, fecha_ingreso_gimnasio, id_sucursal)
        VALUES (@id_usuario, CAST(GETDATE() AS DATE), @id_sucursal);
        SET @id_cliente = SCOPE_IDENTITY();

        INSERT INTO UsuarioRol (id_usuario, id_rol) VALUES (@id_usuario, @id_rol);

        EXEC dbo.usp_GuardarRespuestaSeguridad
             @id_alias = @id_alias, @id_pregunta = @id_pregunta, @respuesta_argon2 = @respuesta_argon2;

        IF @paga_ahora = 1
            EXEC dbo.usp_FacturarMembresia
                 @id_cliente = @id_cliente, @id_tipo_membresia = @id_tipo_membresia,
                 @id_sucursal = @id_sucursal, @id_metodo_pago = @id_metodo_pago, @meses = @meses;

        COMMIT TRANSACTION;

        -- Último resultado: Node lo lee con recordsets.at(-1)
        SELECT @id_usuario AS id_usuario, @id_cliente AS id_cliente, @paga_ahora AS pago_realizado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   3. PERMISOS
      El servidor Node se conecta con un usuario limitado que solo
      puede EJECUTAR procedimientos. Se le da permiso sobre los nuevos,
      buscándolo por el permiso que ya tiene en usp_ObtenerCredencial.
   --------------------------------------------------------- */
DECLARE @quien SYSNAME;
SELECT TOP 1 @quien = pr.name
FROM sys.database_permissions pe
JOIN sys.database_principals pr ON pr.principal_id = pe.grantee_principal_id
WHERE pe.major_id = OBJECT_ID('dbo.usp_ObtenerCredencial')
  AND pe.permission_name = 'EXECUTE'
  AND pe.state_desc = 'GRANT';

IF @quien IS NULL
    PRINT 'No se encontró el usuario de la app (nadie tiene EXECUTE en usp_ObtenerCredencial). Concede los permisos a mano.';
ELSE
BEGIN
    DECLARE @orden NVARCHAR(500) =
        N'GRANT EXECUTE ON dbo.usp_RegistrarCliente TO ' + QUOTENAME(@quien) + N'; ' +
        N'GRANT EXECUTE ON dbo.usp_ListarCatalogos TO '  + QUOTENAME(@quien) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @quien;
END
GO
