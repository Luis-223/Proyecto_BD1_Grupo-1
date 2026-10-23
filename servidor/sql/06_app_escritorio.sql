/* =========================================================
   06_app_escritorio.sql — PROCEDIMIENTOS PARA LA APP DE ESCRITORIO (PRINCIPAL.py)
   Ejecutar en la base FitManager (después de FitManager.sql, 01, 02 y 03).
   Se puede ejecutar más de una vez sin errores.

   La app de escritorio de cada sucursal NO toca las tablas: solo
   ejecuta estos procedimientos (y los de credenciales de 01_argon2.sql).
   Por eso su usuario de base solo necesita permiso EXECUTE, que se da
   al rol rol_app_sucursal al final del script.

   Crea:
     - usp_Escritorio_DatosEmpleado       → datos y roles de quien inicia sesión
     - usp_Escritorio_Resumen             → tarjetas de la página Inicio
     - usp_Escritorio_Catalogos           → clientes, membresías, métodos de pago, entrenadores
     - usp_Escritorio_ListarFacturas      → historial de facturas de la sucursal
     - usp_Escritorio_FacturarMembresia   → factura una membresía en la caja de la sucursal
     - usp_Escritorio_ListarClases        → próximas clases de la sucursal
     - usp_Escritorio_CambiarHorarioClase → mueve una clase y guarda el historial
     - usp_Escritorio_ListarAsignaciones  → clientes de la sucursal y su entrenador
     - usp_Escritorio_CambiarEntrenador   → cierra la asignación actual y crea la nueva
     - usp_Escritorio_ListarProductos     → catálogo con existencias de la sucursal
     - usp_Escritorio_VenderProductos     → venta de varios productos en una factura

   Errores: se usan los números 50200 a 50259 (THROW). La app muestra
   el mensaje tal cual, igual que hace el servidor Node con los 50000+.

   IMPORTANTE: 07_entrenadores.sql reemplaza usp_Escritorio_ListarAsignaciones
   y usp_Escritorio_CambiarEntrenador para permitir VARIOS entrenadores por
   cliente. Si vuelves a ejecutar ESTE script, ejecuta 07_entrenadores.sql
   después, o esos dos vuelven a la versión de un solo entrenador.
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
IF OBJECT_ID('dbo.usp_FacturarMembresia', 'P') IS NULL OR OBJECT_ID('dbo.usp_ObtenerCredencial', 'P') IS NULL
BEGIN
    RAISERROR('Faltan usp_FacturarMembresia o usp_ObtenerCredencial: ejecuta antes FitManager.sql y 01_argon2.sql.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. DATOS DEL EMPLEADO QUE INICIA SESIÓN
      La contraseña ya la revisó la app (Argon2). Aquí solo se
      devuelven su nombre, estado y roles, y se comprueba que la
      sucursal configurada en escritorio.env exista.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_DatosEmpleado
    @id_alias    INT,
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @nombre_sucursal VARCHAR(100) =
        (SELECT nombre_sucursal FROM Sucursal WHERE id_sucursal = @id_sucursal);
    IF @nombre_sucursal IS NULL
        THROW 50200, N'La sucursal configurada en escritorio.env (ID_SUCURSAL) no existe en la base.', 1;

    SELECT a.id_alias,
           a.alias,
           u.id_usuario,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre,
           e.nombre_estado AS estado,
           ISNULL((SELECT STRING_AGG(r.nombre_rol, ',')
                   FROM UsuarioRol ur
                   JOIN Rol r ON r.id_rol = ur.id_rol
                   WHERE ur.id_usuario = u.id_usuario), '') AS roles,
           @id_sucursal     AS id_sucursal,
           @nombre_sucursal AS sucursal
    FROM AliasUsuario a
    JOIN Usuario u ON u.id_usuario = a.id_usuario
    JOIN Estado e  ON e.id_estado  = u.id_estado
    WHERE a.id_alias = @id_alias;
END
GO

/* ---------------------------------------------------------
   2. RESUMEN PARA LA PÁGINA DE INICIO
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_Resumen
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @hoy    DATE = CAST(GETDATE() AS DATE);
    DECLARE @manana DATE = DATEADD(DAY, 1, @hoy);
    -- Lunes de esta semana, sin importar la configuración de DATEFIRST
    DECLARE @lunes  DATE = DATEADD(DAY, -((DATEPART(WEEKDAY, @hoy) + @@DATEFIRST - 2) % 7), @hoy);

    SELECT
        -- Clientes de esta sucursal con una membresía (no suspendida) que cubre hoy
        (SELECT COUNT(DISTINCT m.id_cliente)
         FROM Membresia m
         JOIN Cliente c ON c.id_cliente = m.id_cliente
         WHERE c.id_sucursal = @id_sucursal
           AND m.estado <> 'Suspendida'
           AND @hoy BETWEEN m.fecha_inicio AND m.fecha_fin)            AS clientes_activos,

        (SELECT COUNT(*) FROM Factura
         WHERE id_sucursal = @id_sucursal AND estado <> 'Anulada'
           AND fecha_emision >= @hoy AND fecha_emision < @manana)      AS facturas_hoy,

        (SELECT COUNT(*) FROM ClaseGrupal
         WHERE id_sucursal = @id_sucursal
           AND fecha_hora >= @lunes AND fecha_hora < DATEADD(DAY, 7, @lunes)) AS clases_semana,

        (SELECT ISNULL(SUM(total), 0) FROM Factura
         WHERE id_sucursal = @id_sucursal AND estado <> 'Anulada'
           AND fecha_emision >= @hoy AND fecha_emision < @manana)      AS ventas_hoy;
END
GO

/* ---------------------------------------------------------
   3. CATÁLOGOS PARA LAS LISTAS DESPLEGABLES
      Cada SELECT es un resultado distinto, EN ESTE ORDEN
      (conexion_bd.py → catalogos() los lee por posición).
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_Catalogos
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    -- 0. Clientes (de todas las sucursales: los Oro pueden pagar en cualquiera)
    SELECT c.id_cliente,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre,
           u.nit_dpi
    FROM Cliente c
    JOIN Usuario u ON u.id_usuario = c.id_usuario
    ORDER BY u.primer_nombre_us, u.primer_apellido_us;

    -- 1. Tipos de membresía
    SELECT id_tipo_membresia, nombre_tipo, precio_base, duracion_meses
    FROM TipoMembresia
    ORDER BY precio_base;

    -- 2. Métodos de pago
    SELECT id_metodo_pago, nombre_metodo
    FROM MetodoPago
    ORDER BY id_metodo_pago;

    -- 3. Entrenadores de esta sucursal
    SELECT e.id_entrenador,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre,
           e.especialidad
    FROM Entrenador e
    JOIN Usuario u ON u.id_usuario = e.id_usuario
    WHERE e.id_sucursal = @id_sucursal
    ORDER BY u.primer_nombre_us, u.primer_apellido_us;
END
GO

/* ---------------------------------------------------------
   4. HISTORIAL DE FACTURAS DE LA SUCURSAL (las más recientes)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ListarFacturas
    @id_sucursal INT,
    @cantidad    INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@cantidad)
           f.id_factura,
           COALESCE(f.numero_factura, CAST(f.id_factura AS VARCHAR(20))) AS numero,
           u.primer_nombre_us + ' ' + u.primer_apellido_us AS cliente,
           ISNULL(d.descripcion, '')
             + CASE WHEN d.lineas > 1 THEN ' (+' + CAST(d.lineas - 1 AS VARCHAR(10)) + ')' ELSE '' END AS concepto,
           ISNULL(p.nombre_metodo, '') AS metodo,
           f.total,
           f.fecha_emision
    FROM Factura f
    JOIN Cliente c ON c.id_cliente = f.id_cliente
    JOIN Usuario u ON u.id_usuario = c.id_usuario
    OUTER APPLY (   -- primera línea de la factura y cuántas líneas tiene
        SELECT TOP 1 df.descripcion,
               COUNT(*) OVER () AS lineas
        FROM DetalleFactura df
        WHERE df.id_factura = f.id_factura
        ORDER BY df.id_detalle_factura
    ) d
    OUTER APPLY (   -- método con el que se pagó
        SELECT TOP 1 mp.nombre_metodo
        FROM Pago pg
        JOIN MetodoPago mp ON mp.id_metodo_pago = pg.id_metodo_pago
        WHERE pg.id_factura = f.id_factura
        ORDER BY pg.id_pago
    ) p
    WHERE f.id_sucursal = @id_sucursal
    ORDER BY f.fecha_emision DESC, f.id_factura DESC;
END
GO

/* ---------------------------------------------------------
   5. FACTURAR UNA MEMBRESÍA DESDE LA CAJA
      Reutiliza usp_FacturarMembresia (Membresia + Factura +
      DetalleFactura + Pago) y además:
        - la factura queda en la sucursal de la CAJA (no la del cliente)
        - guarda qué empleado la hizo (Factura.id_usuario)
        - si el usuario estaba 'Inactivo' (registrado sin pagar o
          vencido) pasa a 'Activo', igual que usp_PagarMembresiaApp
      Todo en UNA transacción.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_FacturarMembresia
    @id_cliente        INT,
    @id_tipo_membresia INT,
    @id_metodo_pago    INT,
    @meses             INT,
    @id_sucursal       INT,   -- sucursal donde está la caja (escritorio.env)
    @id_usuario        INT    -- empleado que factura
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @id_usuario_cliente INT = (SELECT id_usuario FROM Cliente WHERE id_cliente = @id_cliente);
    IF @id_usuario_cliente IS NULL
        THROW 50210, N'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM Sucursal WHERE id_sucursal = @id_sucursal)
        THROW 50211, N'La sucursal de la caja no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM MetodoPago WHERE id_metodo_pago = @id_metodo_pago)
        THROW 50212, N'El método de pago no es válido.', 1;
    IF NOT EXISTS (SELECT 1 FROM TipoMembresia WHERE id_tipo_membresia = @id_tipo_membresia)
        THROW 50213, N'El tipo de membresía no existe.', 1;
    IF @meses IS NULL OR @meses < 1 OR @meses > 12
        THROW 50214, N'Se pueden pagar entre 1 y 12 meses.', 1;

    DECLARE @id_activo   INT = (SELECT id_estado FROM Estado WHERE nombre_estado = 'Activo');
    DECLARE @id_inactivo INT = (SELECT id_estado FROM Estado WHERE nombre_estado = 'Inactivo');

    -- Aquí cae lo que devuelve usp_FacturarMembresia (su SELECT final)
    DECLARE @resultado TABLE (
        id_factura    INT,
        total         DECIMAL(12,2),
        vigente_desde DATE,
        vigente_hasta DATE
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO @resultado (id_factura, total, vigente_desde, vigente_hasta)
        EXEC dbo.usp_FacturarMembresia
             @id_cliente = @id_cliente, @id_tipo_membresia = @id_tipo_membresia,
             @id_sucursal = @id_sucursal, @id_metodo_pago = @id_metodo_pago, @meses = @meses;

        UPDATE Factura SET id_usuario = @id_usuario
        WHERE id_factura = (SELECT id_factura FROM @resultado);

        IF @id_activo IS NOT NULL AND @id_inactivo IS NOT NULL
            UPDATE Usuario SET id_estado = @id_activo
            WHERE id_usuario = @id_usuario_cliente AND id_estado = @id_inactivo;

        COMMIT TRANSACTION;

        SELECT id_factura, total, vigente_desde, vigente_hasta FROM @resultado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   6. PRÓXIMAS CLASES DE LA SUCURSAL
      El entrenador es la asignación más reciente de la clase
      (el mismo criterio que usa rutas/clases.js).
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ListarClases
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT g.id_clase,
           g.nombre_clase,
           g.fecha_hora,
           ISNULL(ent.nombre, '(sin asignar)') AS entrenador,
           g.cupo_maximo,
           (SELECT COUNT(*) FROM ClienteClase cc WHERE cc.id_clase = g.id_clase) AS inscritos
    FROM ClaseGrupal g
    OUTER APPLY (
        SELECT TOP 1 u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre
        FROM AsignacionEntrenador ae
        JOIN Entrenador en ON en.id_entrenador = ae.id_entrenador
        JOIN Usuario u     ON u.id_usuario     = en.id_usuario
        WHERE ae.id_clase = g.id_clase
        ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC
    ) ent
    WHERE g.id_sucursal = @id_sucursal
      AND g.fecha_hora >= CAST(GETDATE() AS DATE)     -- desde hoy en adelante
    ORDER BY g.fecha_hora;
END
GO

/* ---------------------------------------------------------
   7. CAMBIAR EL HORARIO DE UNA CLASE
      Guarda el cambio en HistorialCambioHorario y actualiza la clase.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_CambiarHorarioClase
    @id_clase         INT,
    @id_sucursal      INT,
    @nueva_fecha_hora DATETIME,
    @motivo           VARCHAR(150) = NULL,
    @id_usuario       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @anterior DATETIME, @sucursal_clase INT;
    SELECT @anterior = fecha_hora, @sucursal_clase = id_sucursal
    FROM ClaseGrupal WHERE id_clase = @id_clase;

    IF @anterior IS NULL
        THROW 50220, N'La clase no existe.', 1;
    IF @sucursal_clase <> @id_sucursal
        THROW 50221, N'Esa clase es de otra sucursal.', 1;
    IF @anterior <= GETDATE()
        THROW 50222, N'La clase ya empezó o ya pasó; no se puede mover.', 1;
    IF @nueva_fecha_hora IS NULL OR @nueva_fecha_hora <= GETDATE()
        THROW 50223, N'La nueva fecha y hora debe ser en el futuro.', 1;
    IF @nueva_fecha_hora = @anterior
        THROW 50224, N'La clase ya está en esa fecha y hora.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO HistorialCambioHorario
               (id_clase, fecha_hora_anterior, fecha_hora_nueva, motivo, id_usuario, fecha_cambio)
        VALUES (@id_clase, @anterior, @nueva_fecha_hora, NULLIF(LTRIM(RTRIM(@motivo)), ''), @id_usuario, GETDATE());

        UPDATE ClaseGrupal SET fecha_hora = @nueva_fecha_hora
        WHERE id_clase = @id_clase;

        COMMIT TRANSACTION;

        SELECT @id_clase AS id_clase, @anterior AS fecha_hora_anterior, @nueva_fecha_hora AS fecha_hora_nueva;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   8. CLIENTES DE LA SUCURSAL Y SU ENTRENADOR ACTUAL
      Los clientes sin entrenador también salen, para poder asignarles uno.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ListarAsignaciones
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT c.id_cliente,
           uc.primer_nombre_us + ' ' + uc.primer_apellido_us AS cliente,
           act.id_entrenador,
           ISNULL(act.nombre, '(sin entrenador)') AS entrenador,
           act.fecha_asignacion
    FROM Cliente c
    JOIN Usuario uc ON uc.id_usuario = c.id_usuario
    OUTER APPLY (
        SELECT TOP 1 ae.id_entrenador, ae.fecha_asignacion,
               ue.primer_nombre_us + ' ' + ue.primer_apellido_us AS nombre
        FROM AsignacionEntrenador ae
        JOIN Entrenador en ON en.id_entrenador = ae.id_entrenador
        JOIN Usuario ue    ON ue.id_usuario    = en.id_usuario
        WHERE ae.id_cliente = c.id_cliente
          AND ae.fecha_fin IS NULL
        ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC
    ) act
    WHERE c.id_sucursal = @id_sucursal
    ORDER BY uc.primer_nombre_us, uc.primer_apellido_us;
END
GO

/* ---------------------------------------------------------
   9. CAMBIAR (O ASIGNAR) EL ENTRENADOR DE UN CLIENTE
      La asignación anterior no se borra: se cierra con fecha_fin = hoy,
      así queda el historial de quién lo entrenó y cuándo.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_CambiarEntrenador
    @id_cliente    INT,
    @id_entrenador INT,
    @motivo        VARCHAR(150) = NULL,
    @id_usuario    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM Cliente WHERE id_cliente = @id_cliente)
        THROW 50230, N'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM Entrenador WHERE id_entrenador = @id_entrenador)
        THROW 50231, N'El entrenador no existe.', 1;

    DECLARE @actual INT = (
        SELECT TOP 1 id_entrenador FROM AsignacionEntrenador
        WHERE id_cliente = @id_cliente AND fecha_fin IS NULL
        ORDER BY fecha_asignacion DESC, id_asignacion DESC);
    IF @actual = @id_entrenador
        THROW 50232, N'Ese entrenador ya es el entrenador actual del cliente.', 1;

    DECLARE @hoy DATE = CAST(GETDATE() AS DATE);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE AsignacionEntrenador SET fecha_fin = @hoy
        WHERE id_cliente = @id_cliente AND fecha_fin IS NULL;

        INSERT INTO AsignacionEntrenador (id_entrenador, id_cliente, id_clase, fecha_asignacion, motivo, id_usuario)
        VALUES (@id_entrenador, @id_cliente, NULL, @hoy, NULLIF(LTRIM(RTRIM(@motivo)), ''), @id_usuario);

        COMMIT TRANSACTION;

        SELECT SCOPE_IDENTITY() AS id_asignacion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   10. CATÁLOGO DE PRODUCTOS CON EXISTENCIAS DE LA SUCURSAL
       stock = NULL cuando el producto no lleva inventario (un servicio).
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_ListarProductos
    @id_sucursal INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT p.id_producto,
           p.codigo,
           p.nombre_producto,
           p.precio_venta,
           p.requiere_inventario,
           CASE WHEN p.requiere_inventario = 1 THEN ISNULL(i.stock_actual, 0) END AS stock
    FROM Producto p
    LEFT JOIN InventarioSucursal i
           ON i.id_producto = p.id_producto AND i.id_sucursal = @id_sucursal
    WHERE p.activo = 1
    ORDER BY p.nombre_producto;
END
GO

/* ---------------------------------------------------------
   11. VENDER VARIOS PRODUCTOS EN UNA SOLA FACTURA
       @productos llega como JSON desde la app:
         [{"id_producto": 3, "cantidad": 2}, {"id_producto": 5, "cantidad": 1}]
       Crea Factura + una línea por producto + Pago, descuenta
       InventarioSucursal y anota la salida en MovimientoInventario.
       Todo o nada.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Escritorio_VenderProductos
    @id_cliente     INT,
    @id_sucursal    INT,
    @id_metodo_pago INT,
    @id_usuario     INT,
    @productos      NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM Cliente WHERE id_cliente = @id_cliente)
        THROW 50240, N'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM Sucursal WHERE id_sucursal = @id_sucursal)
        THROW 50241, N'La sucursal de la caja no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM MetodoPago WHERE id_metodo_pago = @id_metodo_pago)
        THROW 50242, N'El método de pago no es válido.', 1;
    IF @productos IS NULL OR ISJSON(@productos) = 0
        THROW 50243, N'La lista de productos no es válida.', 1;

    -- Lo que mandó la app, línea por línea
    DECLARE @lineas TABLE (id_producto INT, cantidad INT);
    INSERT INTO @lineas (id_producto, cantidad)
    SELECT id_producto, cantidad
    FROM OPENJSON(@productos) WITH (id_producto INT '$.id_producto', cantidad INT '$.cantidad');

    IF NOT EXISTS (SELECT 1 FROM @lineas)
        THROW 50244, N'El carrito está vacío.', 1;
    IF EXISTS (SELECT 1 FROM @lineas WHERE id_producto IS NULL OR cantidad IS NULL OR cantidad <= 0)
        THROW 50245, N'Cada producto debe tener una cantidad mayor a cero.', 1;

    -- Un renglón por producto (si vino repetido, se suman las cantidades)
    DECLARE @detalle TABLE (
        id_producto INT PRIMARY KEY,
        cantidad    INT,
        precio      DECIMAL(10,2),
        nombre      VARCHAR(100),
        requiere    BIT
    );
    INSERT INTO @detalle (id_producto, cantidad)
    SELECT id_producto, SUM(cantidad) FROM @lineas GROUP BY id_producto;

    UPDATE d SET precio = p.precio_venta, nombre = p.nombre_producto, requiere = p.requiere_inventario
    FROM @detalle d
    JOIN Producto p ON p.id_producto = d.id_producto AND p.activo = 1;

    IF EXISTS (SELECT 1 FROM @detalle WHERE precio IS NULL)
        THROW 50246, N'Uno de los productos no existe o está deshabilitado.', 1;

    DECLARE @total DECIMAL(12,2) = (SELECT SUM(cantidad * precio) FROM @detalle);
    DECLARE @id_factura INT, @sin_stock VARCHAR(100), @msg NVARCHAR(200);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Revisar existencias bloqueando esas filas hasta terminar
        -- (si dos cajas venden lo mismo a la vez, la segunda espera)
        SELECT TOP 1 @sin_stock = d.nombre
        FROM @detalle d
        LEFT JOIN InventarioSucursal i WITH (UPDLOCK, HOLDLOCK)
               ON i.id_producto = d.id_producto AND i.id_sucursal = @id_sucursal
        WHERE d.requiere = 1 AND ISNULL(i.stock_actual, 0) < d.cantidad;

        IF @sin_stock IS NOT NULL
        BEGIN
            SET @msg = N'No hay suficiente existencia de "' + @sin_stock + N'" en esta sucursal.';
            THROW 50247, @msg, 1;
        END

        INSERT INTO Factura (id_cliente, id_sucursal, fecha_emision, total, id_usuario)
        VALUES (@id_cliente, @id_sucursal, GETDATE(), @total, @id_usuario);
        SET @id_factura = SCOPE_IDENTITY();

        INSERT INTO DetalleFactura (id_factura, id_producto, descripcion, cantidad, precio_unitario)
        SELECT @id_factura, id_producto, nombre, cantidad, precio
        FROM @detalle;

        UPDATE i SET stock_actual = i.stock_actual - d.cantidad
        FROM InventarioSucursal i
        JOIN @detalle d ON d.id_producto = i.id_producto
        WHERE i.id_sucursal = @id_sucursal AND d.requiere = 1;

        INSERT INTO MovimientoInventario
               (id_producto, id_sucursal, tipo_movimiento, cantidad, fecha_movimiento,
                id_usuario, id_detalle_factura, observacion)
        SELECT df.id_producto, @id_sucursal, 'Salida', df.cantidad, GETDATE(),
               @id_usuario, df.id_detalle_factura,
               'Venta, factura ' + CAST(@id_factura AS VARCHAR(10))
        FROM DetalleFactura df
        JOIN @detalle d ON d.id_producto = df.id_producto
        WHERE df.id_factura = @id_factura AND d.requiere = 1;

        INSERT INTO Pago (id_factura, id_metodo_pago, fecha_pago, monto)
        VALUES (@id_factura, @id_metodo_pago, GETDATE(), @total);

        COMMIT TRANSACTION;

        SELECT @id_factura AS id_factura, @total AS total;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   12. PERMISOS PARA LA APP DE ESCRITORIO
       Todo se da al ROL rol_app_sucursal; el usuario de cada
       sucursal solo tiene que ser miembro del rol.
   --------------------------------------------------------- */
IF DATABASE_PRINCIPAL_ID('rol_app_sucursal') IS NULL
    CREATE ROLE rol_app_sucursal;
GO

DECLARE @proc SYSNAME, @orden NVARCHAR(500);
DECLARE procs CURSOR LOCAL FAST_FORWARD FOR
    SELECT nombre FROM (VALUES
        -- credenciales (01_argon2.sql y FitManager.sql)
        ('usp_ObtenerCredencial'), ('usp_RegistrarIntentoLogin'),
        ('usp_GuardarContrasenaArgon2'), ('usp_ValidarLogin'),
        ('usp_ActualizarEstadoMembresias'),
        -- este script
        ('usp_Escritorio_DatosEmpleado'), ('usp_Escritorio_Resumen'), ('usp_Escritorio_Catalogos'),
        ('usp_Escritorio_ListarFacturas'), ('usp_Escritorio_FacturarMembresia'),
        ('usp_Escritorio_ListarClases'), ('usp_Escritorio_CambiarHorarioClase'),
        ('usp_Escritorio_ListarAsignaciones'), ('usp_Escritorio_CambiarEntrenador'),
        ('usp_Escritorio_ListarProductos'), ('usp_Escritorio_VenderProductos')
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
   13. USUARIO DE LA APP DE ESCRITORIO (hacer UNA vez, a mano)
       Cambia la contraseña por una larga y guárdala SOLO en el
       escritorio.env de cada computadora de sucursal.

   --- En AZURE SQL (con la base FitManager seleccionada):
       CREATE USER fitmanager_escritorio WITH PASSWORD = 'Cambia-Esta-Clave-Larga-2026!';
       ALTER ROLE rol_app_sucursal ADD MEMBER fitmanager_escritorio;

   --- En SQL Server LOCAL:
       USE master;
       CREATE LOGIN fitmanager_escritorio WITH PASSWORD = 'Cambia-Esta-Clave-Larga-2026!';
       USE FitManager;
       CREATE USER fitmanager_escritorio FOR LOGIN fitmanager_escritorio;
       ALTER ROLE rol_app_sucursal ADD MEMBER fitmanager_escritorio;
   --------------------------------------------------------- */

/* ---------------------------------------------------------
   14. REVISIÓN RÁPIDA: deben salir 11 procedimientos
   --------------------------------------------------------- */
SELECT name AS procedimiento FROM sys.procedures
WHERE name LIKE 'usp[_]Escritorio[_]%'
ORDER BY name;
GO

PRINT '>>> Ahora ejecuta 07_entrenadores.sql (varios entrenadores por cliente).';
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
