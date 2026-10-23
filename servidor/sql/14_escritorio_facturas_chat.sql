/* =========================================================
   14_escritorio_facturas_chat.sql — LO QUE LE FALTA A LA APP DE ESCRITORIO
   Ejecutar en la base FitManager (después de 13_chat.sql).
   Se puede ejecutar más de una vez sin errores.

   Crea (todo para PRINCIPAL.py, con permiso para rol_app_sucursal):
     - usp_Escritorio_DetalleFactura      → datos para el PDF de una factura
     - usp_Escritorio_ChatBuscarClientes  → buscar un cliente de la sucursal para
                                            empezarle un chat (el chat es el de 13_chat.sql)
     - usp_Escritorio_QuitarEntrenador    → quitar un entrenador a un cliente
                                            (desde 07_entrenadores.sql un cliente
                                            puede tener varios)

   Reemplaza al 07_chat_y_facturas.sql que se había mandado antes:
   ese creaba un chat aparte (tabla Mensaje) que NO se comunicaba con la
   app móvil. Ahora el escritorio usa el mismo chat que chat.tsx (ChatMensaje).

   Errores: números 50400 a 50419 (THROW).
   ========================================================= */

/* ---------------------------------------------------------
   0. ¿ESTAMOS EN LA BASE CORRECTA? ¿YA SE EJECUTÓ EL 13?
   --------------------------------------------------------- */
SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cambia la base en SSMS y vuelve a ejecutar.', 16, 1, @base_actual);
    SET NOEXEC ON;
END
IF OBJECT_ID('dbo.ChatMensaje', 'U') IS NULL OR COL_LENGTH('dbo.AsignacionEntrenador', 'fecha_fin') IS NULL
BEGIN
    RAISERROR('Primero ejecuta 06a_completar_tablas.sql y 13_chat.sql.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. DETALLE DE UNA FACTURA (para el PDF)
      3 resultados, EN ESTE ORDEN (conexion_bd.py los lee por posición):
        0. encabezado  1. líneas  2. pagos
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_DetalleFactura
    @id_factura  INT,
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sucursal_factura INT = (SELECT id_sucursal FROM dbo.Factura WHERE id_factura = @id_factura);
    IF @sucursal_factura IS NULL
        THROW 50400, N'La factura no existe.', 1;
    IF @sucursal_factura <> @id_sucursal
        THROW 50401, N'Esa factura es de otra sucursal.', 1;

    SELECT f.id_factura,
           COALESCE(f.numero_factura, CAST(f.id_factura AS VARCHAR(20))) AS numero,
           f.fecha_emision,
           f.estado,
           f.total,
           CONCAT_WS(' ', uc.primer_nombre_us, uc.segundo_nombre_us,
                          uc.primer_apellido_us, uc.segundo_apellido_us) AS cliente,
           uc.nit_dpi,
           s.nombre_sucursal AS sucursal,
           s.direccion,
           s.telefono,
           NULLIF(CONCAT_WS(' ', ue.primer_nombre_us, ue.primer_apellido_us), '') AS atendido_por
    FROM dbo.Factura f
    JOIN dbo.Cliente c       ON c.id_cliente  = f.id_cliente
    JOIN dbo.Usuario uc      ON uc.id_usuario = c.id_usuario
    JOIN dbo.Sucursal s      ON s.id_sucursal = f.id_sucursal
    LEFT JOIN dbo.Usuario ue ON ue.id_usuario = f.id_usuario
    WHERE f.id_factura = @id_factura;

    SELECT descripcion, cantidad, precio_unitario, subtotal
    FROM dbo.DetalleFactura
    WHERE id_factura = @id_factura
    ORDER BY id_detalle_factura;

    SELECT mp.nombre_metodo AS metodo, p.monto, p.fecha_pago, p.referencia
    FROM dbo.Pago p
    JOIN dbo.MetodoPago mp ON mp.id_metodo_pago = p.id_metodo_pago
    WHERE p.id_factura = @id_factura
    ORDER BY p.id_pago;
END
GO

/* ---------------------------------------------------------
   2. BUSCAR UN CLIENTE DE LA SUCURSAL PARA ESCRIBIRLE
      (usp_Escritorio_ChatEnviar de 13_chat.sql solo deja escribir a
      clientes de la sucursal o que ya le escribieron)
      Busca por nombre, alias o DPI. Máximo 30.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ChatBuscarClientes
    @id_sucursal INT,
    @buscar      NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    SET @buscar = NULLIF(LTRIM(RTRIM(@buscar)), N'');
    -- % _ y [ son comodines en LIKE: se escapan para buscar el texto tal cual
    DECLARE @patron NVARCHAR(400) = N'%' +
        REPLACE(REPLACE(REPLACE(@buscar, N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    SELECT TOP (30)
           c.id_cliente,
           CONCAT_WS(' ', u.primer_nombre_us, u.primer_apellido_us) AS cliente,
           u.nit_dpi
    FROM dbo.Cliente c
    JOIN dbo.Usuario u ON u.id_usuario = c.id_usuario
    WHERE @buscar IS NOT NULL
      AND c.id_sucursal = @id_sucursal
      AND (   CONCAT_WS(' ', u.primer_nombre_us, u.segundo_nombre_us,
                             u.primer_apellido_us, u.segundo_apellido_us) LIKE @patron
           OR u.nit_dpi LIKE @patron
           OR EXISTS (SELECT 1 FROM dbo.AliasUsuario a
                      WHERE a.id_usuario = u.id_usuario AND a.alias LIKE @patron))
    ORDER BY u.primer_nombre_us, u.primer_apellido_us;
END
GO

/* ---------------------------------------------------------
   3. QUITAR UN ENTRENADOR A UN CLIENTE (desde el escritorio)
      No borra: cierra la asignación con fecha_fin = hoy (historial),
      igual que usp_App_QuitarEntrenador de la app.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_QuitarEntrenador
    @id_cliente    INT,
    @id_entrenador INT,
    @id_sucursal   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sucursal_cliente INT = (SELECT id_sucursal FROM dbo.Cliente WHERE id_cliente = @id_cliente);
    IF @sucursal_cliente IS NULL
        THROW 50410, N'El cliente no existe.', 1;
    IF @sucursal_cliente <> @id_sucursal
        THROW 50411, N'Ese cliente es de otra sucursal.', 1;

    UPDATE dbo.AsignacionEntrenador
    SET fecha_fin = CAST(GETDATE() AS DATE)
    WHERE id_cliente = @id_cliente
      AND id_entrenador = @id_entrenador
      AND fecha_fin IS NULL;

    IF @@ROWCOUNT = 0
        THROW 50412, N'Ese entrenador no está asignado a este cliente.', 1;

    SELECT @id_entrenador AS id_entrenador;
END
GO

/* ---------------------------------------------------------
   4. PERMISOS PARA LA APP DE ESCRITORIO
      Incluye los del chat de 13_chat.sql por si el rol se creó después.
   --------------------------------------------------------- */
IF DATABASE_PRINCIPAL_ID('rol_app_sucursal') IS NULL
    CREATE ROLE rol_app_sucursal;
GO

DECLARE @proc SYSNAME, @orden NVARCHAR(500);
DECLARE procs CURSOR LOCAL FAST_FORWARD FOR
    SELECT nombre FROM (VALUES
        ('usp_Escritorio_DetalleFactura'), ('usp_Escritorio_ChatBuscarClientes'),
        ('usp_Escritorio_QuitarEntrenador'),
        ('usp_Escritorio_ChatConversaciones'), ('usp_Escritorio_ChatMensajes'),
        ('usp_Escritorio_ChatEnviar'), ('usp_Escritorio_ChatSinLeer')
    ) AS p(nombre)
    WHERE OBJECT_ID('dbo.' + nombre, 'P') IS NOT NULL;
OPEN procs;
FETCH NEXT FROM procs INTO @proc;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.' + QUOTENAME(@proc) + N' TO rol_app_sucursal;';
    EXEC (@orden);
    FETCH NEXT FROM procs INTO @proc;
END
CLOSE procs;
DEALLOCATE procs;
PRINT 'Permisos EXECUTE dados a rol_app_sucursal.';
GO

/* ---------------------------------------------------------
   5. REVISIÓN: todo lo que usa PRINCIPAL.py. Todo debe decir 'ok'.
      Si algo dice FALTA, el comentario dice qué script ejecutar.
   --------------------------------------------------------- */
SELECT p.nombre, p.script,
       CASE WHEN OBJECT_ID('dbo.' + p.nombre) IS NULL THEN 'FALTA' ELSE 'ok' END AS estado
FROM (VALUES
    ('usp_ObtenerCredencial', '01_argon2.sql'), ('usp_GuardarContrasenaArgon2', '01_argon2.sql'),
    ('usp_RegistrarIntentoLogin', '01_argon2.sql'), ('usp_ValidarLogin', 'FitManager.sql'),
    ('usp_Escritorio_DatosEmpleado', '06_app_escritorio.sql'), ('usp_Escritorio_Resumen', '06_app_escritorio.sql'),
    ('usp_Escritorio_FacturarMembresia', '06_app_escritorio.sql'), ('usp_Escritorio_VenderProductos', '06_app_escritorio.sql'),
    ('usp_Escritorio_CambiarEntrenador', '06 y DESPUÉS 07_entrenadores.sql'),
    ('usp_Escritorio_ChatConversaciones', '13_chat.sql'), ('usp_Escritorio_ChatMensajes', '13_chat.sql'),
    ('usp_Escritorio_ChatEnviar', '13_chat.sql'), ('usp_Escritorio_ChatSinLeer', '13_chat.sql'),
    ('usp_Escritorio_DetalleFactura', '14 (este)'), ('usp_Escritorio_ChatBuscarClientes', '14 (este)'),
    ('usp_Escritorio_QuitarEntrenador', '14 (este)')
) AS p(nombre, script)
ORDER BY estado, p.nombre;

-- ¿Varios entrenadores? Debe decir 'varios'. Si dice 'uno solo', ejecuta 07_entrenadores.sql otra vez.
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.usp_Escritorio_CambiarEntrenador')) LIKE '%SET fecha_fin = @hoy%'
            THEN 'uno solo (ejecuta 07_entrenadores.sql)' ELSE 'varios' END AS entrenadores_por_cliente;
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
