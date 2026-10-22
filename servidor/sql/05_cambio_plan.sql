/* =========================================================
   05_cambio_plan.sql — CAMBIAR DE PLAN PAGANDO SOLO LA DIFERENCIA
   Ejecutar en la base FitManager (después de 03_membresia.sql).

   Crea:
     - usp_CambiarPlanApp → pasa los meses que ya están pagados al plan
       nuevo y cobra solo la diferencia de precio (trama MEMBRESIA con
       esCambioTipo = 1).

   Ejemplo: Plata (Q145) con 6 meses pagados desde hoy, cambia a Oro (Q160):
     diferencia por mes = 160 - 145 = Q15  →  6 meses x Q15 = Q90.
     Los 6 meses quedan como Oro; la fecha "pagado hasta" NO cambia.

   Reglas:
     - Cuentan los meses no suspendidos cuya fecha_fin es hoy o después
       (el mes en curso también se cobra completo).
     - Solo se puede SUBIR de plan. Bajar (Oro → Plata) no devuelve
       dinero: se rechaza y la app ofrece agregar meses al final.
     - Los precios son los de TipoMembresia.precio_base (los mismos
       que ve la app para calcular el total).
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
   1. CAMBIAR DE PLAN
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_CambiarPlanApp
    @id_cliente         INT,
    @id_tipo_nuevo      INT,
    @id_metodo_pago     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @id_sucursal INT = (SELECT id_sucursal FROM Cliente WHERE id_cliente = @id_cliente);
    IF @id_sucursal IS NULL
        THROW 50050, 'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM MetodoPago WHERE id_metodo_pago = @id_metodo_pago)
        THROW 50051, 'El método de pago no es válido.', 1;

    DECLARE @precio_nuevo DECIMAL(10,2), @nombre_nuevo VARCHAR(50);
    SELECT @precio_nuevo = precio_base, @nombre_nuevo = nombre_tipo
    FROM TipoMembresia WHERE id_tipo_membresia = @id_tipo_nuevo;
    IF @precio_nuevo IS NULL
        THROW 50052, 'El tipo de membresía no existe.', 1;

    DECLARE @hoy DATE = CAST(GETDATE() AS DATE);

    -- Meses pagados (hoy o después) que todavía no son del plan nuevo
    DECLARE @meses TABLE (
        id_membresia INT PRIMARY KEY,
        fecha_inicio DATE,
        fecha_fin    DATE,
        diferencia   DECIMAL(10,2)
    );
    INSERT INTO @meses (id_membresia, fecha_inicio, fecha_fin, diferencia)
    SELECT m.id_membresia, m.fecha_inicio, m.fecha_fin, @precio_nuevo - t.precio_base
    FROM Membresia m
    JOIN TipoMembresia t ON t.id_tipo_membresia = m.id_tipo_membresia
    WHERE m.id_cliente = @id_cliente
      AND m.estado <> 'Suspendida'
      AND m.fecha_fin >= @hoy
      AND m.id_tipo_membresia <> @id_tipo_nuevo;

    IF NOT EXISTS (SELECT 1 FROM @meses)
        THROW 50053, 'No tienes meses pagados que cambiar a ese plan.', 1;
    IF EXISTS (SELECT 1 FROM @meses WHERE diferencia <= 0)
        THROW 50054, 'Solo puedes cambiar a un plan de mayor precio. Para bajar de plan, agrega los meses al final de tu membresía actual.', 1;

    DECLARE @total DECIMAL(10,2) = (SELECT SUM(diferencia) FROM @meses);
    DECLARE @cantidad INT = (SELECT COUNT(*) FROM @meses);
    DECLARE @id_factura INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO Factura (id_cliente, id_sucursal, fecha_emision, total)
        VALUES (@id_cliente, @id_sucursal, GETDATE(), @total);
        SET @id_factura = SCOPE_IDENTITY();

        -- Una línea de factura por cada mes cambiado (solo la diferencia)
        INSERT INTO DetalleFactura (id_factura, id_membresia, descripcion, cantidad, precio_unitario)
        SELECT @id_factura, id_membresia,
               LEFT('Cambio a ' + @nombre_nuevo + ' del ' + CONVERT(VARCHAR(10), fecha_inicio, 103)
                    + ' al ' + CONVERT(VARCHAR(10), fecha_fin, 103), 100),
               1, diferencia
        FROM @meses;

        -- Los meses pasan al plan nuevo (beneficios de Oro desde ya)
        UPDATE m SET id_tipo_membresia = @id_tipo_nuevo
        FROM Membresia m
        JOIN @meses x ON x.id_membresia = m.id_membresia;

        INSERT INTO Pago (id_factura, id_metodo_pago, fecha_pago, monto)
        VALUES (@id_factura, @id_metodo_pago, GETDATE(), @total);

        COMMIT TRANSACTION;

        -- Último resultado: Node lo lee con recordsets.at(-1)
        SELECT (SELECT MAX(fecha_fin) FROM Membresia
                WHERE id_cliente = @id_cliente AND estado <> 'Suspendida') AS pagado_hasta,
               @total AS total,
               @cantidad AS meses_cambiados,
               @nombre_nuevo AS plan_nuevo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   2. PERMISOS
      En Azure, fitmanager_servidor ya tiene EXECUTE sobre todo el
      esquema dbo; esto es para las copias locales.
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(500);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_CambiarPlanApp TO ' + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permiso concedido a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* ---------------------------------------------------------
   3. REVISIÓN
   --------------------------------------------------------- */
SELECT name AS procedimiento FROM sys.procedures WHERE name = 'usp_CambiarPlanApp';
GO

SET NOEXEC OFF;
GO
